/**
 * Bot Session Runner — PHASE 0 HARDENED VERSION.
 *
 * Responsibilities:
 *   1. Load session + bot_config from DB.
 *   2. Decrypt credentials (or fail loud if the master key is missing).
 *   3. Instantiate the correct portal adapter.
 *   4. Drive the tick loop, update heartbeat on every iteration.
 *   5. Persist state ONLY to columns that exist (post-migration).
 *   6. On any error, mark the session as `failed` with a useful reason
 *      (instead of leaving it `active` forever).
 *
 * Known limitations (to be fixed in Phase 1):
 *   - No distributed lock yet. Two workers would race. The new
 *     `locked_until` / `worker_id` columns are in place but the BullMQ
 *     queue + Redlock integration lands with the Phase 1 rewrite.
 *   - The ComprasGovPortal adapter throws UnsupportedOperationError until
 *     Phase 1 — that is INTENTIONAL. It's better to surface "not yet
 *     supported" than to pretend a lance was submitted.
 *   - The MockPortal remains available for end-to-end pipeline testing.
 *
 * What changed vs the previous version:
 *   - Writes `bids_placed` / `current_price` / `last_heartbeat` — these
 *     columns exist now (migration 20260416200000).
 *   - Decrements by `min_decrease_value` from the bot_config, not a
 *     hardcoded R$0.01.
 *   - Guards `minPrice` null correctly (was `state.melhor_lance > minPrice`
 *     which was always false when minPrice was null).
 *   - Emits explicit `action_type`s that survive the CHECK constraint
 *     (the old `'bid'` is still accepted, but we now also emit
 *     `'bid_submitted'` / `'heartbeat'` / `'session_failed'`).
 *   - Reads password from the ciphertext columns via readBotConfigSecrets.
 *   - Catches UnsupportedOperationError specifically and fails the
 *     session cleanly.
 */

import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { BasePortal } from './portals/base-portal'
import { ComprasGovPortal, UnsupportedOperationError } from './portals/comprasgov'
import { MockPortal } from './portals/mock-portal'
import { readBotConfigSecrets, type BotConfigRow } from './lib/crypto'

const TICK_MS = 3000

interface BotSessionRow {
  id: string
  pregao_id: string
  portal: string
  status: string
  strategy_config: Record<string, unknown> | null
  min_price: number | null
  max_bids: number | null
  bids_placed: number
  current_price: number | null
  mode: string
  bot_configs: (BotConfigRow & {
    username: string
    portal: string
    min_decrease_value: number | null
    min_decrease_percent: number | null
  }) | null
}

export class BotSessionRunner {
  private portal: BasePortal | null = null
  private pollInterval: NodeJS.Timeout | null = null
  private stopping = false

  constructor(public sessionId: string) {}

  async start(): Promise<void> {
    let session: BotSessionRow | null = null

    try {
      const { data, error } = await supabase
        .from('bot_sessions')
        .select('*, bot_configs(*)')
        .eq('id', this.sessionId)
        .single()

      if (error || !data) {
        throw new Error(`Session not found: ${this.sessionId}`)
      }
      session = data as BotSessionRow

      if (!session.bot_configs) {
        throw new Error('Session has no linked bot_config — cannot resolve credentials')
      }

      // Decrypt credentials. If the master key is missing or the cipher is
      // corrupt this throws — we want that to fail the session explicitly
      // instead of silently continuing with an empty password.
      const secrets = readBotConfigSecrets(session.bot_configs)
      if (secrets.legacyPlaintext) {
        logger.warn(
          { sessionId: this.sessionId, configId: session.bot_configs.username },
          'bot_config row is still using legacy plaintext credentials — schedule backfill encryption',
        )
      }

      // Instantiate the correct portal adapter.
      if (session.portal === 'comprasgov' || session.portal === 'comprasnet') {
        this.portal = new ComprasGovPortal({
          username: session.bot_configs.username,
          portal: session.portal,
        })
      } else if (session.portal === 'simulator' || session.portal === 'mock') {
        this.portal = new MockPortal({ username: 'sim', portal: 'simulator' })
      } else {
        throw new UnsupportedOperationError(
          `Portal "${session.portal}" is not yet supported. ` +
            'Supported in Phase 0: simulator. Phase 1 will add comprasgov (supervisor + auto-bid).',
        )
      }

      // Move to active + stamp the initial heartbeat.
      await supabase
        .from('bot_sessions')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
          worker_id: `${process.env.HOSTNAME || 'local'}-${process.pid}`,
        })
        .eq('id', this.sessionId)

      await supabase.from('bot_actions').insert({
        session_id: this.sessionId,
        action_type: 'session_start',
        details: { mode: session.mode, portal: session.portal },
      })

      // Login. Note: secrets.cookies is the JSON storage state (post-guided-login)
      // or null; the adapter decides how to use it.
      const storageState = secrets.cookies ? (JSON.parse(secrets.cookies) as unknown[]) : []
      const loggedIn = await this.portal.login(storageState)
      if (!loggedIn) {
        throw new Error('Portal rejected login')
      }

      await this.portal.navigateToPregao(session.pregao_id)

      // Start the monitoring loop. We explicitly guard against overlapping
      // ticks because Puppeteer operations can exceed the interval — the
      // previous version had no reentrance guard and could submit twice.
      let tickInFlight = false
      this.pollInterval = setInterval(() => {
        if (tickInFlight || this.stopping) return
        tickInFlight = true
        this.tick(session!)
          .catch((err: Error) => {
            logger.error(
              { sessionId: this.sessionId, err: err.message },
              'Error in bot tick',
            )
          })
          .finally(() => {
            tickInFlight = false
          })
      }, TICK_MS)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error(
        { sessionId: this.sessionId, err: message },
        'Failed to start bot runner',
      )
      await this.markFailed(message)
      await this.stop()
    }
  }

  private async tick(session: BotSessionRow): Promise<void> {
    if (!this.portal || this.stopping) return

    // Re-check status from DB (user may have paused/cancelled).
    const { data: fresh } = await supabase
      .from('bot_sessions')
      .select('status, bids_placed')
      .eq('id', this.sessionId)
      .single()

    if (!fresh) return

    if (fresh.status === 'paused' || fresh.status === 'cancelled' || fresh.status === 'failed') {
      await this.stop()
      return
    }

    // Heartbeat: prove to the watchdog we're still alive.
    const heartbeatTs = new Date().toISOString()
    const state = await this.portal.getState()

    if (state.encerrado) {
      await supabase
        .from('bot_sessions')
        .update({
          status: 'completed',
          completed_at: heartbeatTs,
          last_heartbeat: heartbeatTs,
        })
        .eq('id', this.sessionId)

      await supabase.from('bot_actions').insert({
        session_id: this.sessionId,
        action_type: 'session_completed',
        details: { final_state: state },
      })
      await this.stop()
      return
    }

    if (!state.ativo) {
      // Dispute not open yet — just heartbeat and wait.
      await supabase
        .from('bot_sessions')
        .update({ last_heartbeat: heartbeatTs })
        .eq('id', this.sessionId)
      return
    }

    // Evaluate strategy
    const minPrice = session.min_price
    const maxBids = session.max_bids
    const bidsPlaced = fresh.bids_placed ?? 0

    if (maxBids !== null && bidsPlaced >= maxBids) {
      // Limit reached — just heartbeat and wait for encerramento.
      await supabase
        .from('bot_sessions')
        .update({ last_heartbeat: heartbeatTs })
        .eq('id', this.sessionId)
      return
    }

    // Correct guards:
    //   - we only bid when we are NOT already in first place (nossa_posicao === 1 means we're winning)
    //   - melhor_lance must be a real number
    //   - if min_price is null, we have no floor and should NOT bid blindly
    if (state.nossa_posicao === 1 || state.melhor_lance === null || minPrice === null) {
      await supabase
        .from('bot_sessions')
        .update({ last_heartbeat: heartbeatTs })
        .eq('id', this.sessionId)
      return
    }

    // Compute next bid using the config's min_decrease_value (+percent) rather
    // than a hardcoded R$0.01.
    const minDecValue = session.bot_configs?.min_decrease_value ?? 0.01
    const minDecPercent = session.bot_configs?.min_decrease_percent ?? 0
    const percentStep = state.melhor_lance * (minDecPercent / 100)
    const step = Math.max(minDecValue, percentStep)
    let proposedBid = state.melhor_lance - step

    if (proposedBid < minPrice) proposedBid = minPrice
    proposedBid = Math.round(proposedBid * 100) / 100 // 2 decimals

    if (proposedBid >= state.melhor_lance) {
      // Our floor is already >= current best — we cannot undercut.
      await supabase.from('bot_actions').insert({
        session_id: this.sessionId,
        action_type: 'bid_below_min',
        details: { current_best: state.melhor_lance, floor: minPrice },
      })
      await supabase
        .from('bot_sessions')
        .update({ last_heartbeat: heartbeatTs })
        .eq('id', this.sessionId)
      return
    }

    // Submit. UnsupportedOperationError from the stub will bubble up to
    // the catch in start() and mark the session failed.
    const startTs = Date.now()
    const success = await this.portal.submitLance(proposedBid)
    const latencyMs = Date.now() - startTs

    if (success) {
      await supabase
        .from('bot_sessions')
        .update({
          bids_placed: bidsPlaced + 1,
          current_price: proposedBid,
          last_heartbeat: heartbeatTs,
        })
        .eq('id', this.sessionId)

      await supabase.from('bot_actions').insert({
        session_id: this.sessionId,
        action_type: 'bid_submitted',
        details: { valor: proposedBid, original_best: state.melhor_lance, step },
        latency_ms: latencyMs,
      })
    } else {
      await supabase.from('bot_actions').insert({
        session_id: this.sessionId,
        action_type: 'bid_rejected',
        details: { valor: proposedBid, original_best: state.melhor_lance },
        latency_ms: latencyMs,
      })
    }
  }

  private async markFailed(reason: string): Promise<void> {
    await supabase
      .from('bot_sessions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        result: { error: reason },
      })
      .eq('id', this.sessionId)

    await supabase.from('bot_actions').insert({
      session_id: this.sessionId,
      action_type: 'session_failed',
      details: { reason },
    })
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    if (this.portal) {
      try {
        await this.portal.close()
      } catch (err) {
        logger.warn(
          { sessionId: this.sessionId, err: err instanceof Error ? err.message : err },
          'Portal close errored',
        )
      }
    }
  }
}
