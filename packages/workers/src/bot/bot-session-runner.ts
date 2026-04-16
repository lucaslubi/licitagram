/**
 * Bot Session Runner — Phase 1 rewrite.
 *
 * Drives a single bot_session from `pending` → `active` → terminal state.
 *
 * Responsibilities:
 *   - Resolve the BrowserContext via the shared pool (reuses storageState
 *     from prior sessions — skips SSO re-login in the common case).
 *   - Attach the portal adapter to that context.
 *   - Login if not already authenticated.
 *   - Open the pregão room and install the XHR tap for forensic replay.
 *   - Drive the tick loop with proper reentrance guard.
 *   - For every tick: read state, consult the strategy, act accordingly,
 *     persist storage state after writes, emit bot_events.
 *   - Release the DB lock when done.
 *
 * The BullMQ processor (bot-session-execute.processor.ts) is responsible
 * for acquiring the lock before calling start() — this class assumes the
 * lock is already held.
 */

import type { BrowserContext } from 'playwright'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { getOrCreateContext, getStorageState, closeContext } from './lib/browser-manager'
import {
  readBotConfigSecrets,
  encryptSecret,
  type BotConfigRow,
} from './lib/crypto'
import {
  BasePortal,
  CaptchaRequiredError,
  InvalidCredentialsError,
  MfaRequiredError,
  UnsupportedOperationError,
  type BotState,
  type PortalCredentials,
} from './portals/base-portal'
import { getPortalAdapter } from './portals/index'
import { decide, type StrategyConfig, type StrategyInput, type StrategyKind } from './lib/strategy'
import { fanoutEvent } from './lib/webhook-fanout'

const TICK_MS = 6_000 // IN 73/2022 minimum interval
const MAX_TICKS_PER_JOB = 200 // ~20 minutes of work per BullMQ job, then re-enqueue

export interface SessionRow {
  id: string
  company_id: string
  config_id: string | null
  pregao_id: string
  portal: string
  status: string
  mode: string
  strategy_config: Record<string, unknown> | null
  min_price: number | null
  max_bids: number | null
  bids_placed: number
  current_price: number | null
  started_at: string | null
  bot_configs:
    | (BotConfigRow & {
        id: string
        username: string
        portal: string
        min_decrease_value: number | null
        min_decrease_percent: number | null
        bid_times: number[] | null
      })
    | null
}

export class BotSessionRunner {
  private ticks = 0
  private portal: BasePortal | null = null
  private context: BrowserContext | null = null
  private startedAtMs = 0
  private companyId: string | null = null

  constructor(
    public readonly sessionId: string,
    private readonly workerTag: string,
  ) {}

  /**
   * Execute until the session reaches a terminal state OR the job budget is
   * exhausted. When the budget is exhausted, we release the lock and return
   * a `reEnqueue: true` signal so the processor can schedule a follow-up.
   */
  async run(): Promise<{ reEnqueue: boolean; reason: string }> {
    const session = await this.loadSession()

    if (!session) {
      return { reEnqueue: false, reason: 'session_not_found' }
    }
    this.companyId = session.company_id
    if (session.status !== 'pending' && session.status !== 'active') {
      return { reEnqueue: false, reason: `session_not_runnable:${session.status}` }
    }
    if (!session.bot_configs) {
      await this.markFailed(session.id, 'Session has no linked bot_config')
      return { reEnqueue: false, reason: 'no_config' }
    }

    // Decrypt credentials first so we fail fast on key mismatch.
    let secrets: ReturnType<typeof readBotConfigSecrets>
    try {
      secrets = readBotConfigSecrets(session.bot_configs)
    } catch (err) {
      await this.markFailed(
        session.id,
        `Failed to decrypt credentials: ${err instanceof Error ? err.message : err}`,
      )
      return { reEnqueue: false, reason: 'decrypt_failed' }
    }

    if (secrets.legacyPlaintext) {
      logger.warn(
        { sessionId: session.id, configId: session.bot_configs.id },
        'bot_config is using legacy plaintext — run migrate-plaintext-passwords',
      )
    }

    try {
      this.context = await getOrCreateContext(session.bot_configs.id, secrets.cookies ?? undefined)
      this.portal = this.makePortal(session)
      this.portal.attach(this.context)

      // Wire the portal's observed events into bot_events.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.portal as any).onObservedEvent = (kind: string, payload: Record<string, unknown>) =>
        this.emitEvent(session.id, kind, payload).catch(() => undefined)

      if (!(await this.portal.isLoggedIn())) {
        const creds: PortalCredentials = {
          usuario: session.bot_configs.username,
          senha: secrets.password,
          cnpjLicitante: undefined,
        }
        await this.portal.login(creds)

        // Persist the freshly-captured storage state (encrypted).
        await this.persistStorageState(session.bot_configs.id, this.context)

        await this.emitEvent(session.id, 'login_refresh', {
          mode: session.mode,
          portal: session.portal,
        })
      }

      await this.portal.openPregaoRoom(session.pregao_id)

      // Transition to active
      this.startedAtMs = session.started_at ? Date.parse(session.started_at) : Date.now()
      await supabase
        .from('bot_sessions')
        .update({
          status: 'active',
          started_at: session.started_at ?? new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
          worker_id: this.workerTag,
        })
        .eq('id', session.id)

      await this.emitEvent(session.id, 'snapshot', { event: 'session_started' })

      // If supervisor mode, set the floor once and loop as observer.
      if (session.mode === 'supervisor' && session.min_price !== null) {
        try {
          await this.portal.setFloor({
            valorFinalMinimo: session.min_price,
            intervaloMinimoSegundos:
              session.bot_configs.min_decrease_value && session.bot_configs.min_decrease_value >= 1
                ? Math.ceil(session.bot_configs.min_decrease_value)
                : 6,
          })
          await this.emitEvent(session.id, 'supervisor_handoff', {
            valorFinalMinimo: session.min_price,
          })
        } catch (err) {
          // setFloor can fail if the portal UI isn't at the right screen
          // yet — not fatal. Fall through to observation loop.
          logger.warn(
            { sessionId: session.id, err: err instanceof Error ? err.message : err },
            'supervisor setFloor failed — continuing as observer',
          )
        }
      }

      return await this.tickLoop(session)
    } catch (err) {
      await this.handleTerminalError(session, err)
      return { reEnqueue: false, reason: 'error' }
    } finally {
      if (this.portal) {
        await this.portal.close().catch(() => undefined)
      }
    }
  }

  private async tickLoop(session: SessionRow): Promise<{ reEnqueue: boolean; reason: string }> {
    const strategyKind = (session.strategy_config?.type as StrategyKind | undefined) ?? 'minimal_decrease'
    const cfg: StrategyConfig = {
      kind: session.mode === 'shadow' ? 'shadow' : strategyKind,
      minPrice: session.min_price,
      maxBids: session.max_bids,
      bidsPlacedSoFar: session.bids_placed,
      minDecValue: session.bot_configs?.min_decrease_value ?? 0.01,
      minDecPercent: session.bot_configs?.min_decrease_percent ?? 0,
      bidTimes: session.bot_configs?.bid_times ?? [60, 30, 10, 3],
      snipeSafetyMarginMs: 1500,
    }

    let bidsPlaced = session.bids_placed

    while (this.ticks < MAX_TICKS_PER_JOB) {
      this.ticks++

      // Re-read status each tick so paused/cancelled is honored within 6 s.
      const { data: fresh } = await supabase
        .from('bot_sessions')
        .select('status')
        .eq('id', session.id)
        .single()

      if (!fresh) return { reEnqueue: false, reason: 'session_vanished' }
      if (fresh.status === 'paused') return { reEnqueue: false, reason: 'paused' }
      if (fresh.status === 'cancelled') return { reEnqueue: false, reason: 'cancelled' }
      if (fresh.status === 'failed') return { reEnqueue: false, reason: 'failed' }

      let state: BotState
      try {
        state = await this.portal!.getState()
      } catch (err) {
        await this.emitEvent(session.id, 'error', {
          phase: 'getState',
          err: err instanceof Error ? err.message : String(err),
        })
        await this.heartbeat(session.id)
        await this.sleep(TICK_MS)
        continue
      }

      await this.emitEvent(session.id, 'tick', {
        fase: state.fase,
        melhor_lance: state.melhor_lance,
        nossa_posicao: state.nossa_posicao,
        nosso_lance: state.nosso_lance,
        segundos_restantes: state.segundos_restantes ?? null,
      })

      if (state.encerrado) {
        await supabase
          .from('bot_sessions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            last_heartbeat: new Date().toISOString(),
            locked_until: null,
            worker_id: null,
          })
          .eq('id', session.id)
        await this.emitEvent(session.id, 'phase_encerrado', { fase: state.fase })
        return { reEnqueue: false, reason: 'completed' }
      }

      const strategyInput: StrategyInput = {
        fase: state.fase,
        ativo: state.ativo,
        encerrado: state.encerrado,
        melhor_lance: state.melhor_lance,
        nosso_lance: state.nosso_lance,
        nossa_posicao: state.nossa_posicao,
        segundos_restantes: state.segundos_restantes ?? null,
      }
      const decision = decide(strategyInput, { ...cfg, bidsPlacedSoFar: bidsPlaced })

      if (decision.kind === 'stop') {
        await supabase
          .from('bot_sessions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            last_heartbeat: new Date().toISOString(),
            locked_until: null,
            worker_id: null,
          })
          .eq('id', session.id)
        await this.emitEvent(session.id, 'phase_encerrado', { reason: decision.reason })
        return { reEnqueue: false, reason: 'stop_decision' }
      }

      if (decision.kind === 'wait') {
        // Shadow mode: if the ghost strategy would have bid, log it.
        if (session.mode === 'shadow' && decision.reason.startsWith('shadow_would_bid')) {
          await this.emitEvent(session.id, 'shadow_observation', { reason: decision.reason })
        }
        await this.heartbeat(session.id)
        await this.sleep(TICK_MS)
        continue
      }

      // decision.kind === 'bid'
      if (session.mode === 'supervisor') {
        // Supervisor mode relies on the portal's native auto-bidder. We do
        // NOT click Submit ourselves. Record what the native robô should
        // be doing, but don't compete with it.
        await this.emitEvent(session.id, 'supervisor_handoff', {
          would_bid: decision.valor,
          reason: decision.reason,
        })
        await this.heartbeat(session.id)
        await this.sleep(TICK_MS)
        continue
      }

      // Auto-bid mode: actually submit.
      const ok = await this.portal!.submitLance(decision.valor)
      if (ok) {
        bidsPlaced++
        await supabase
          .from('bot_sessions')
          .update({
            bids_placed: bidsPlaced,
            current_price: decision.valor,
            last_heartbeat: new Date().toISOString(),
          })
          .eq('id', session.id)
        await supabase.from('bot_actions').insert({
          session_id: session.id,
          action_type: 'bid_submitted',
          details: { valor: decision.valor, reason: decision.reason },
        })
        await this.emitEvent(session.id, 'our_bid', {
          valor: decision.valor,
          reason: decision.reason,
        })
      } else {
        await supabase.from('bot_actions').insert({
          session_id: session.id,
          action_type: 'bid_rejected',
          details: { valor: decision.valor, reason: decision.reason },
        })
        await this.emitEvent(session.id, 'our_bid_nack', {
          valor: decision.valor,
          reason: decision.reason,
        })
      }

      await this.sleep(TICK_MS)
    }

    // Budget exhausted — release the lock and request a re-enqueue.
    await supabase
      .from('bot_sessions')
      .update({
        last_heartbeat: new Date().toISOString(),
        locked_until: null,
      })
      .eq('id', session.id)

    return { reEnqueue: true, reason: 'tick_budget_exhausted' }
  }

  private makePortal(session: SessionRow): BasePortal {
    return getPortalAdapter(session.portal, {
      portal: session.portal,
      configId: session.bot_configs?.id ?? session.config_id ?? 'unknown',
    })
  }

  private async loadSession(): Promise<SessionRow | null> {
    const { data, error } = await supabase
      .from('bot_sessions')
      .select('*, bot_configs(*)')
      .eq('id', this.sessionId)
      .single()
    if (error || !data) return null
    return data as SessionRow
  }

  private async persistStorageState(configId: string, context: BrowserContext): Promise<void> {
    try {
      const json = await getStorageState(context)
      const { cipher, nonce } = encryptSecret(json)
      await supabase
        .from('bot_configs')
        .update({ cookies_cipher: cipher, cookies_nonce: nonce, cookies: null })
        .eq('id', configId)
    } catch (err) {
      logger.warn(
        { configId, err: err instanceof Error ? err.message : err },
        'Failed to persist storage state after login',
      )
    }
  }

  private async handleTerminalError(session: SessionRow, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ sessionId: session.id, err: message }, 'Session terminal error')

    if (err instanceof InvalidCredentialsError) {
      // Invalidate stored cookies so next attempt does a fresh SSO.
      if (session.bot_configs?.id) {
        await supabase
          .from('bot_configs')
          .update({ cookies_cipher: null, cookies_nonce: null, cookies: null })
          .eq('id', session.bot_configs.id)
        await closeContext(session.bot_configs.id)
      }
      await this.markFailed(session.id, `Invalid credentials: ${message}`)
      return
    }

    if (err instanceof CaptchaRequiredError || err instanceof MfaRequiredError) {
      await supabase
        .from('bot_sessions')
        .update({
          status: 'paused',
          result: { error: message, needs_human: true },
          last_heartbeat: new Date().toISOString(),
          locked_until: null,
          worker_id: null,
        })
        .eq('id', session.id)
      await supabase.from('bot_actions').insert({
        session_id: session.id,
        action_type: err instanceof MfaRequiredError ? 'captcha_failed' : 'captcha_failed',
        details: { reason: message },
      })
      return
    }

    await this.markFailed(session.id, message)
  }

  private async markFailed(sessionId: string, reason: string): Promise<void> {
    await supabase
      .from('bot_sessions')
      .update({
        status: 'failed',
        result: { error: reason },
        completed_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
        locked_until: null,
        worker_id: null,
      })
      .eq('id', sessionId)
    await supabase.from('bot_actions').insert({
      session_id: sessionId,
      action_type: 'session_failed',
      details: { reason },
    })
  }

  private async emitEvent(
    sessionId: string,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const tMs = this.startedAtMs ? Date.now() - this.startedAtMs : 0
    try {
      const { error } = await supabase
        .from('bot_events')
        .insert({ session_id: sessionId, kind, t_ms: tMs, payload })
      if (error) {
        logger.warn({ sessionId, kind, err: error.message }, 'Failed to insert bot_event')
      }
    } catch (err) {
      logger.warn(
        { sessionId, kind, err: err instanceof Error ? err.message : err },
        'Failed to insert bot_event',
      )
    }

    // Fire-and-forget webhook fan-out. Never let a bad webhook break
    // the bidding loop.
    if (this.companyId) {
      fanoutEvent(this.companyId, sessionId, kind, payload).catch(() => undefined)
    }
  }

  private async heartbeat(sessionId: string): Promise<void> {
    await supabase
      .from('bot_sessions')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', sessionId)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }
}
