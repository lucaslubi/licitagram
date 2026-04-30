/**
 * Bot Session Runner v2 — usa DisputeEngine (HTTP API direto) em vez
 * de Playwright/browser. Substitui o bot-session-runner.ts legado quando
 * a config da empresa tem bot_tokens conectado.
 *
 * Fluxo:
 *   1. Carrega sessão e metadata do bot_configs
 *   2. Busca bot_tokens da empresa (JWT access + refresh descriptografados)
 *   3. Extrai compraId do pregao_id (ou URL)
 *   4. Inicia DisputeEngine com callbacks que persistem em bot_events
 *   5. Loop até sessão ser cancelada ou pregão encerrar
 */

import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { redisClient } from '../../queues/connection'
import { DisputeEngine, type EngineStrategy } from './dispute-engine'
import {
  extractCompraId,
  type DisputeItem,
  type TokenPair,
} from './comprasgov-api'

// Reutiliza a crypto que já conversa com o mesmo master key do web
// (apps/web usa encryptCredential pra salvar bot_tokens, worker decifra)
import { decryptCredential, encryptCredential } from '../../pregao-chat-monitor/lib/crypto'

export interface RunnerInput {
  sessionId: string
  companyId: string
  pregaoId: string // pode ser URL ou só o ID numérico
  mode: 'shadow' | 'supervisor' | 'auto_bid'
  minPrice: number | null
  strategyConfig: {
    puloMinimo?: number
    puloMaximo?: number
    lanceFechado?: number | null
    delayMin?: number
    delayMax?: number
    standbyMin?: number
  } | null
}

export interface RunnerOutput {
  ok: boolean
  reason: string
  details?: Record<string, unknown>
}

/** Converte bytea (hex '\x...' ou Buffer) pra Buffer válido — mesmo fix do crypto.ts */
function byteaToBuffer(v: Buffer | Uint8Array | string | null): Buffer | null {
  if (!v) return null
  if (Buffer.isBuffer(v)) return v
  if (v instanceof Uint8Array) return Buffer.from(v)
  if (typeof v === 'string') {
    let hex = v
    if (hex.startsWith('\\x')) hex = hex.slice(2)
    let buf: Buffer
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      buf = Buffer.from(hex, 'hex')
    } else {
      buf = Buffer.from(v, 'base64')
    }
    // Double-encode detection: se o Buffer decodificado começa com
    // '{"type":"Buffer"', é porque o Supabase-JS driver serializou um
    // Buffer como JSON string antes de salvar no bytea. Faz o
    // "unwrap" lendo o data array do JSON.
    if (buf.length > 16) {
      const prefix = buf.toString('utf8', 0, 16)
      if (prefix.startsWith('{"type":"Buffer"')) {
        try {
          const parsed = JSON.parse(buf.toString('utf8')) as { type?: string; data?: number[] }
          if (parsed.type === 'Buffer' && Array.isArray(parsed.data)) {
            return Buffer.from(parsed.data)
          }
        } catch {
          /* segue com o buf original */
        }
      }
    }
    return buf
  }
  return null
}

/**
 * Carrega JWTs da tabela bot_tokens e decifra.
 * Retorna null se não houver token ativo.
 */
async function loadTokens(companyId: string): Promise<{
  tokens: TokenPair
  rowId: string
} | null> {
  const { data: row, error } = await supabase
    .from('bot_tokens')
    .select('id, access_token_cipher, access_token_nonce, refresh_token_cipher, refresh_token_nonce')
    .eq('company_id', companyId)
    .eq('portal', 'comprasgov')
    .eq('status', 'active')
    .maybeSingle()

  if (error || !row) return null

  try {
    const accessCipher = byteaToBuffer(row.access_token_cipher as Buffer | string | null)
    const accessNonce = byteaToBuffer(row.access_token_nonce as Buffer | string | null)
    if (!accessCipher || !accessNonce) return null
    const accessToken = decryptCredential(accessCipher, accessNonce)

    let refreshToken: string | null = null
    const refCipher = byteaToBuffer(row.refresh_token_cipher as Buffer | string | null)
    const refNonce = byteaToBuffer(row.refresh_token_nonce as Buffer | string | null)
    if (refCipher && refNonce) {
      refreshToken = decryptCredential(refCipher, refNonce)
    }

    return { tokens: { accessToken, refreshToken }, rowId: row.id as string }
  } catch (err) {
    logger.error(
      { companyId, err: err instanceof Error ? err.message : err },
      '[nexus-runner] decrypt bot_tokens failed',
    )
    return null
  }
}

/**
 * Persiste tokens refreshados de volta na tabela.
 */
async function persistRefreshedTokens(rowId: string, tokens: TokenPair): Promise<void> {
  try {
    const accessEnc = encryptCredential(tokens.accessToken)
    const payload: Record<string, unknown> = {
      access_token_cipher: accessEnc.cipher,
      access_token_nonce: accessEnc.nonce,
      last_refresh_at: new Date().toISOString(),
    }
    if (tokens.refreshToken) {
      const refEnc = encryptCredential(tokens.refreshToken)
      payload.refresh_token_cipher = refEnc.cipher
      payload.refresh_token_nonce = refEnc.nonce
    }
    // Atualiza access_exp decodando sem valida sig
    try {
      const parts = tokens.accessToken.split('.')
      if (parts.length === 3) {
        let b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
        while (b64.length % 4) b64 += '='
        const p = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
        if (typeof p.exp === 'number') payload.access_exp = p.exp
      }
    } catch {
      /* noop */
    }
    await supabase.from('bot_tokens').update(payload).eq('id', rowId)
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, '[nexus-runner] persist refresh failed')
  }
}

async function emitBotEvent(
  sessionId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('bot_events').insert({
      session_id: sessionId,
      kind,
      payload,
      t_ms: 0,
    })
  } catch {
    /* noop */
  }
}

/**
 * F8: single-account lock. Evita 2 sessões da mesma conta gov.br
 * (mesmo accountId/companyId+portal) rodando em paralelo — o portal
 * derruba a sessão mais antiga e o operador perde a conexão.
 *
 * Lock TTL = 6h (mesmo MAX_RUNTIME do engine). Se worker morre, lock
 * expira sozinho. Renovado a cada 5min via heartbeat.
 */
const ACCOUNT_LOCK_TTL_SEC = 6 * 60 * 60

async function acquireAccountLock(
  accountKey: string,
  sessionId: string,
): Promise<boolean> {
  const key = `bot:account:${accountKey}`
  // SET NX EX — atomic acquire
  const res = await redisClient.set(key, sessionId, 'EX', ACCOUNT_LOCK_TTL_SEC, 'NX')
  return res === 'OK'
}

async function refreshAccountLock(accountKey: string, sessionId: string): Promise<void> {
  const key = `bot:account:${accountKey}`
  // só refresh se EU é o dono
  const cur = await redisClient.get(key)
  if (cur === sessionId) {
    await redisClient.expire(key, ACCOUNT_LOCK_TTL_SEC)
  }
}

async function releaseAccountLock(accountKey: string, sessionId: string): Promise<void> {
  const key = `bot:account:${accountKey}`
  const cur = await redisClient.get(key)
  if (cur === sessionId) {
    await redisClient.del(key)
  }
}

/**
 * Roda uma sessão até o fim (ou crash). Retorna outcome pro processor.
 */
export async function runNexusSession(input: RunnerInput): Promise<RunnerOutput> {
  const { sessionId, companyId, pregaoId, mode, minPrice, strategyConfig } = input

  // F8: lock por conta gov.br (companyId + portal). Bloqueia sessões
  // concorrentes da mesma conta — portal invalida quando há login duplo.
  const accountKey = `${companyId}:comprasgov`
  const got = await acquireAccountLock(accountKey, sessionId)
  if (!got) {
    const holder = await redisClient.get(`bot:account:${accountKey}`)
    logger.warn(
      { sessionId, accountKey, holder },
      '[nexus-runner] Conta gov.br já em uso por outra sessão',
    )
    await supabase
      .from('bot_sessions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        result: {
          error:
            'Outra sessão dessa empresa já está rodando no Compras.gov.br. Cancele a sessão ativa antes de iniciar uma nova.',
          code: 'account_lock_held',
          holder_session_id: holder,
        },
      })
      .eq('id', sessionId)
    return { ok: false, reason: 'account_lock_held', details: { holder } }
  }

  // 1. Compra ID do pregão
  const compraId = extractCompraId(pregaoId)
  if (!compraId) {
    return { ok: false, reason: 'invalid_pregao_id', details: { pregaoId } }
  }

  // 2. Tokens Compras.gov.br
  const loaded = await loadTokens(companyId)
  if (!loaded) {
    return {
      ok: false,
      reason: 'no_gov_connection',
      details: {
        hint: 'Cliente precisa conectar conta Compras.gov.br em /bot → aba Conectar',
      },
    }
  }

  // 3. Strategy por item — carrega mapa de bot_session_items (se existir).
  //    Cada item pode ter piso/ativo próprios; se não houver linha, usa
  //    o session.min_price como fallback pra TODOS os itens (legacy).
  const baseStrategy: EngineStrategy = {
    chaoFinanceiro: minPrice,
    puloMinimo: strategyConfig?.puloMinimo ?? 0.01,
    puloMaximo: strategyConfig?.puloMaximo ?? 0.05,
    lanceFechado: strategyConfig?.lanceFechado ?? null,
    delayMin: strategyConfig?.delayMin ?? 0,
    delayMax: strategyConfig?.delayMax ?? 0,
    standbyMin: strategyConfig?.standbyMin ?? 0,
    ativo: true,
  }

  // Carrega configuração por item
  const { data: itemRows } = await supabase
    .from('bot_session_items')
    .select('item_numero, piso, ativo')
    .eq('session_id', sessionId)

  const itemConfigMap = new Map<number, { piso: number | null; ativo: boolean }>()
  for (const r of itemRows || []) {
    itemConfigMap.set(Number(r.item_numero), {
      piso: r.piso != null ? Number(r.piso) : null,
      ativo: r.ativo !== false,
    })
  }
  const hasItemConfig = itemConfigMap.size > 0

  const strategyByItem = (numero: number): EngineStrategy | null => {
    if (!hasItemConfig) return baseStrategy // legacy: mesmo piso pra todos

    const cfg = itemConfigMap.get(numero)
    if (!cfg) {
      // Item não configurado pelo usuário → não operar nesse
      return { ...baseStrategy, ativo: false }
    }
    if (!cfg.ativo) {
      return { ...baseStrategy, ativo: false }
    }
    return {
      ...baseStrategy,
      chaoFinanceiro: cfg.piso ?? minPrice, // se não tem piso no item, usa global
      ativo: true,
    }
  }

  // 4. Marca sessão active + start
  await supabase
    .from('bot_sessions')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', sessionId)

  await emitBotEvent(sessionId, 'session_started', { mode, compraId })

  let bidsPlaced = 0
  let terminalError: string | null = null

  // F5: refs mutáveis pra strategy/floor — UI pode atualizar via PATCH e o
  //     poll abaixo propaga pro engine sem reiniciar a sessão.
  const liveState = {
    minPrice: minPrice,
    rateLimit: {
      minDelayBetweenOwnBidsMs: (strategyConfig as { minDelayBetweenOwnBidsMs?: number } | null)
        ?.minDelayBetweenOwnBidsMs ?? 3000,
      maxBidsPerMinute: (strategyConfig as { maxBidsPerMinute?: number } | null)
        ?.maxBidsPerMinute ?? 15,
    },
    stopLoss: {
      enabled: Boolean(
        (strategyConfig as { stopLossPct?: number; stopLossWindowSec?: number } | null)?.stopLossPct,
      ),
      pct: (strategyConfig as { stopLossPct?: number } | null)?.stopLossPct ?? 0,
      windowSec: (strategyConfig as { stopLossWindowSec?: number } | null)?.stopLossWindowSec ?? 60,
    },
  }

  // F6: histórico de preço por item pra stop-loss
  const priceHistory = new Map<number, Array<{ t: number; p: number }>>()

  const engine = new DisputeEngine(compraId, loaded.tokens, strategyByItem, {
    onTokenRefreshed: async (t) => {
      await persistRefreshedTokens(loaded.rowId, t)
      await emitBotEvent(sessionId, 'login_refresh', { has_refresh: !!t.refreshToken })
    },
    onBidPlaced: async (item: DisputeItem, bid: number) => {
      bidsPlaced++
      await supabase
        .from('bot_sessions')
        .update({
          bids_placed: bidsPlaced,
          current_price: bid,
          last_heartbeat: new Date().toISOString(),
        })
        .eq('id', sessionId)
      await emitBotEvent(sessionId, 'our_bid_ack', {
        item: item.numero,
        bid,
        fase: item.faseOriginal,
        mercado_anterior: item.melhorValor,
      })
    },
    onBidRejected: async (item, erro) => {
      await emitBotEvent(sessionId, 'our_bid_nack', {
        item: item.numero,
        erro,
        fase: item.faseOriginal,
      })
    },
    onBidSkip: async (item, reason, ctx) => {
      // F1: emit motivos pelos quais o engine NÃO disparou. Antes 100%
      // silencioso → sessão ficava "em execução" com 0 lances sem
      // diagnóstico. Crítico pro design partner entender o que tá rolando.
      await emitBotEvent(sessionId, 'our_bid_skip', {
        item: item.numero,
        reason,
        fase: item.faseOriginal,
        ...(ctx || {}),
      })
    },
    onFloorBreachPrevented: async (item, attempted, floor) => {
      await emitBotEvent(sessionId, 'floor_breach_prevented', {
        item: item.numero,
        attempted,
        floor,
        fase: item.faseOriginal,
      })
      logger.warn(
        { sessionId, item: item.numero, attempted, floor },
        '[nexus-runner] floor breach prevented at submit',
      )
    },
    onScan: async (items) => {
      await supabase
        .from('bot_sessions')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('id', sessionId)
      // Emit light snapshot a cada scan
      await emitBotEvent(sessionId, 'tick', {
        n_items: items.length,
        ativos: items.filter((i) => i.podeEnviarLances).length,
      })
    },
    onError: async (err) => {
      logger.error(
        { sessionId, err: err.message },
        '[nexus-runner] engine error',
      )
      terminalError = err.message
      await emitBotEvent(sessionId, 'error', { message: err.message })
    },
  })

  // shadow mode: só observa (o engine já não dispara porque strategy em shadow
  // retorna deny no evaluateBid se config.kind === 'shadow' — mas no nosso
  // engine passamos a strategy unchanged; o engine SEMPRE tenta atirar.
  // Pra shadow, zero o disparo interceptando no callback):
  if (mode === 'shadow') {
    // override: bloqueia callback de execução
    // (a gente vê tudo em onScan mas não atira)
    // Hack: strategy com puloMinimo absurdo vai fazer evaluateBid recusar
    baseStrategy.puloMinimo = 999999999
    baseStrategy.puloMaximo = 999999999
  }

  // F4: aplica rate-limit inicial
  engine.setRateLimit(liveState.rateLimit)

  try {
    await engine.start(500) // sweep 500ms

    // Loop até sessão ser cancelada externamente ou o pregão encerrar.
    // F7: poll de 1s (era 3s) → reação <1s a PAUSE/CANCEL.
    // F5: refetch min_price/strategy_config a cada loop pra propagar
    //     edição ao vivo do operador SEM reiniciar a sessão.
    // F6: stop-loss avalia queda de preço por janela.
    const MAX_RUNTIME_MS = 6 * 60 * 60 * 1000 // 6h teto
    const start = Date.now()
    let cancelled = false
    let lastHeartbeatAt = 0
    const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000 // F9: 5min
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, 1000)) // F7: 1s

      const { data: cur } = await supabase
        .from('bot_sessions')
        .select('status, min_price, strategy_config')
        .eq('id', sessionId)
        .single()

      if (!cur) break
      if (cur.status === 'cancelled') {
        cancelled = true
        break
      }
      // F7: pausa imediata via DB status='paused' (UI dispara isso).
      if (cur.status === 'paused') {
        if (!engine.isPaused()) {
          engine.pause()
          await emitBotEvent(sessionId, 'session_paused', {})
          logger.info({ sessionId }, '[nexus-runner] sessão pausada pelo operador')
        }
      } else if (cur.status === 'active' && engine.isPaused()) {
        engine.resume()
        await emitBotEvent(sessionId, 'session_resumed', {})
      }
      if (terminalError) break
      if (Date.now() - start > MAX_RUNTIME_MS) break

      // F9: heartbeat — renova lock Redis + atualiza last_heartbeat no DB.
      // Engine sweep já mantém o token quente via ensureAccessToken, mas
      // o lock precisa de refresh explícito pra não expirar em sessões
      // longas.
      const now2 = Date.now()
      if (now2 - lastHeartbeatAt > HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatAt = now2
        try {
          await refreshAccountLock(accountKey, sessionId)
          await supabase
            .from('bot_sessions')
            .update({ last_heartbeat: new Date().toISOString() })
            .eq('id', sessionId)
        } catch (err) {
          logger.warn(
            { sessionId, err: err instanceof Error ? err.message : err },
            '[nexus-runner] heartbeat refresh failed',
          )
        }
      }

      // F5: aplica updates de strategy ao vivo
      if (cur.min_price !== liveState.minPrice) {
        await emitBotEvent(sessionId, 'strategy_updated', {
          field: 'min_price',
          old: liveState.minPrice,
          new: cur.min_price,
        })
        liveState.minPrice = cur.min_price as number | null
        baseStrategy.chaoFinanceiro = cur.min_price as number | null
      }
      const cfgRaw = cur.strategy_config as Record<string, unknown> | null
      if (cfgRaw) {
        const newRL = {
          minDelayBetweenOwnBidsMs:
            typeof cfgRaw.minDelayBetweenOwnBidsMs === 'number'
              ? (cfgRaw.minDelayBetweenOwnBidsMs as number)
              : liveState.rateLimit.minDelayBetweenOwnBidsMs,
          maxBidsPerMinute:
            typeof cfgRaw.maxBidsPerMinute === 'number'
              ? (cfgRaw.maxBidsPerMinute as number)
              : liveState.rateLimit.maxBidsPerMinute,
        }
        if (
          newRL.minDelayBetweenOwnBidsMs !== liveState.rateLimit.minDelayBetweenOwnBidsMs ||
          newRL.maxBidsPerMinute !== liveState.rateLimit.maxBidsPerMinute
        ) {
          liveState.rateLimit = newRL
          engine.setRateLimit(newRL)
          await emitBotEvent(sessionId, 'strategy_updated', { field: 'rateLimit', new: newRL })
        }
        if (typeof cfgRaw.stopLossPct === 'number' || typeof cfgRaw.stopLossWindowSec === 'number') {
          liveState.stopLoss = {
            enabled: true,
            pct: (cfgRaw.stopLossPct as number) ?? liveState.stopLoss.pct,
            windowSec: (cfgRaw.stopLossWindowSec as number) ?? liveState.stopLoss.windowSec,
          }
        }
      }

      // F6: stop-loss — se o preço CAIR mais que pct% em windowSec
      //     em qualquer item ativo, pausa engine e alerta.
      if (liveState.stopLoss.enabled && liveState.stopLoss.pct > 0) {
        const nowMs = Date.now()
        const cutoff = nowMs - liveState.stopLoss.windowSec * 1000
        for (const item of engine.getLastScan()) {
          if (item.melhorValor === null) continue
          const hist = priceHistory.get(item.numero) || []
          hist.push({ t: nowMs, p: item.melhorValor })
          while (hist.length > 0 && hist[0]!.t < cutoff) hist.shift()
          priceHistory.set(item.numero, hist)
          if (hist.length >= 2) {
            const oldest = hist[0]!
            const dropPct = ((oldest.p - item.melhorValor) / oldest.p) * 100
            if (dropPct >= liveState.stopLoss.pct) {
              await emitBotEvent(sessionId, 'stop_loss_triggered', {
                item: item.numero,
                from: oldest.p,
                to: item.melhorValor,
                drop_pct: Number(dropPct.toFixed(2)),
                window_sec: liveState.stopLoss.windowSec,
              })
              await supabase
                .from('bot_sessions')
                .update({ status: 'paused' })
                .eq('id', sessionId)
              logger.warn(
                { sessionId, item: item.numero, dropPct },
                '[nexus-runner] STOP-LOSS triggered',
              )
              break
            }
          }
        }
      }

      // Pregão acabou (todos os itens encerrados)?
      const scan = engine.getLastScan()
      if (
        scan.length > 0 &&
        scan.every((i) => i.fase === 'encerrada' || i.fase === 'aguardando')
      ) {
        logger.info({ sessionId }, '[nexus-runner] pregão encerrado, finalizando')
        break
      }
    }
    if (cancelled) {
      // F7: cancelamento explícito pelo operador
      await emitBotEvent(sessionId, 'session_cancelled', {})
    }
  } finally {
    engine.stop()
    // F8: libera lock independente de outcome
    try {
      await releaseAccountLock(accountKey, sessionId)
    } catch {
      /* lock vai expirar pelo TTL */
    }
  }

  if (terminalError) {
    await supabase
      .from('bot_sessions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        result: { error: terminalError },
      })
      .eq('id', sessionId)
    return { ok: false, reason: 'engine_error', details: { error: terminalError } }
  }

  await supabase
    .from('bot_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: { bids_placed: bidsPlaced, compraId },
    })
    .eq('id', sessionId)

  return { ok: true, reason: 'completed', details: { bids_placed: bidsPlaced } }
}
