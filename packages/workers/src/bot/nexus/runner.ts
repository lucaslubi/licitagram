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
    if (v.startsWith('\\x')) return Buffer.from(v.slice(2), 'hex')
    if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) return Buffer.from(v, 'hex')
    return Buffer.from(v, 'base64')
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
 * Roda uma sessão até o fim (ou crash). Retorna outcome pro processor.
 */
export async function runNexusSession(input: RunnerInput): Promise<RunnerOutput> {
  const { sessionId, companyId, pregaoId, mode, minPrice, strategyConfig } = input

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

  try {
    await engine.start(500) // sweep 500ms

    // Loop até sessão ser cancelada externamente ou o pregão encerrar
    const MAX_RUNTIME_MS = 6 * 60 * 60 * 1000 // 6h teto
    const start = Date.now()
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, 3000))

      const { data: cur } = await supabase
        .from('bot_sessions')
        .select('status')
        .eq('id', sessionId)
        .single()

      if (!cur || cur.status === 'cancelled' || cur.status === 'paused') {
        break
      }
      if (terminalError) break
      if (Date.now() - start > MAX_RUNTIME_MS) break

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
  } finally {
    engine.stop()
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
