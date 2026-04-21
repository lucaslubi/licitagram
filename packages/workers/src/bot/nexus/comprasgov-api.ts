/**
 * Compras.gov.br API — SaaS port do driver do LicitaNexus.
 *
 * Copiado/adaptado descaradamente do `src/drivers/comprasgov_bidder.js`
 * do concorrente, traduzido pra Node.js (fetch direto, sem Electron).
 *
 * Contratos descobertos via engenharia reversa do app web oficial do
 * Compras.gov.br:
 *
 *   GET    /comprasnet-disputa/v1/compras/:id/participacao           → modo disputa
 *   GET    /comprasnet-disputa/v1/compras/:id/itens/em-disputa       → lista itens
 *   GET    /comprasnet-disputa/v1/compras/:id/itens/em-disputa/:n/itens-grupo → sub-itens
 *   POST   /comprasnet-disputa/v1/compras/:id/itens/:itemId/lances   → dar lance
 *   PUT    /comprasnet-usuario/v2/sessao/fornecedor/retoken          → refresh token
 */

const COMPRAS_HOST = 'https://cnetmobile.estaleiro.serpro.gov.br'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const TIMEOUT_MS = 8000

export interface TokenPair {
  accessToken: string
  refreshToken: string | null
}

export interface DisputeItem {
  numero: number
  lote: string
  faseOriginal: string
  fase: 'aberta' | 'randomica' | 'fechada' | 'encerrada' | 'aguardando' | 'bloqueado'
  podeEnviarLances: boolean
  melhorValor: number | null
  seuValor: number | null
  posicaoAtual: 1 | 99
  intervaloMinimo: number | null
  tempoSegundos: number
  absoluteEndTime: number | null
  casasDecimais: number
  versaoItem: number | null
  versaoParticipante: number | null
  status: string
}

export interface ShootResult {
  sucesso: boolean
  erro?: string
  cooldownMs?: number
  statusHttp?: number
}

export interface ParticipacaoInfo {
  modoDisputa: 'ABERTO' | 'FECHADO' | 'ABERTO E FECHADO' | 'FECHADO E ABERTO' | string
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export function getJwtExp(token: string): number {
  const p = decodeJwtPayload(token)
  return p && typeof p.exp === 'number' ? p.exp : 0
}

export function isTokenValid(token: string | null | undefined, bufferSec = 30): boolean {
  if (!token) return false
  const exp = getJwtExp(token)
  const now = Math.floor(Date.now() / 1000)
  return exp > now + bufferSec
}

export function classifyToken(token: string): 'access' | 'refresh' | 'unknown' {
  const p = decodeJwtPayload(token)
  if (!p) return 'unknown'
  if (p.id_sessao !== undefined && p.identificacao_fornecedor === undefined) return 'refresh'
  if (p.identificacao_fornecedor !== undefined) return 'access'
  return 'unknown'
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (!s) return null
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const cleaned = normalized.replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function padLote(numero: number): string {
  return `ITEM ${String(numero).padStart(2, '0')}`
}

// ─── Auth & Fetch ─────────────────────────────────────────────────────────

function defaultHeaders(accessToken: string, extra?: Record<string, string>): HeadersInit {
  return {
    Accept: 'application/json, text/plain, */*',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'x-device-platform': 'web',
    'x-version-number': '6.0.1',
    ...(extra || {}),
  }
}

async function fetchJSON(
  url: string,
  accessToken: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const { timeoutMs = TIMEOUT_MS, headers: initHeaders, ...rest } = init
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...rest,
      headers: defaultHeaders(accessToken, initHeaders as Record<string, string>),
      signal: ctrl.signal,
    })
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      /* non-JSON */
    }
    return { ok: res.ok, status: res.status, data, text }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * PUT /comprasnet-usuario/v2/sessao/fornecedor/retoken
 * Body vazio, Authorization: Bearer <refreshToken>
 */
export async function refreshToken(refreshTokenValue: string): Promise<TokenPair | null> {
  const url = `${COMPRAS_HOST}/comprasnet-usuario/v2/sessao/fornecedor/retoken`
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: defaultHeaders(refreshTokenValue),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { accessToken?: string; refreshToken?: string }
    if (!data.accessToken) return null
    return { accessToken: data.accessToken, refreshToken: data.refreshToken ?? null }
  } catch {
    return null
  }
}

/**
 * Retorna tokens válidos (refresh se necessário) ou null se não der.
 */
export async function ensureAccessToken(tokens: TokenPair): Promise<TokenPair | null> {
  if (isTokenValid(tokens.accessToken, 30)) return tokens
  if (!tokens.refreshToken || !isTokenValid(tokens.refreshToken, 5)) return null
  return await refreshToken(tokens.refreshToken)
}

// ─── Participação ─────────────────────────────────────────────────────────

export async function getParticipacao(
  compraId: string,
  accessToken: string,
): Promise<ParticipacaoInfo> {
  const url = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/participacao`
  try {
    const res = await fetchJSON(url, accessToken)
    if (!res.ok) return { modoDisputa: 'ABERTO E FECHADO' }
    const raw = res.data as
      | { modoDisputa?: string }
      | Array<{ modoDisputa?: string }>
      | null
    let md: string | undefined
    if (Array.isArray(raw) && raw.length > 0) md = raw[0]?.modoDisputa
    else if (raw && typeof raw === 'object') md = (raw as { modoDisputa?: string }).modoDisputa
    if (!md) return { modoDisputa: 'ABERTO E FECHADO' }
    const mdUp = md.toUpperCase()
    const map: Record<string, ParticipacaoInfo['modoDisputa']> = {
      AF: 'ABERTO E FECHADO',
      FA: 'FECHADO E ABERTO',
      A: 'ABERTO',
      F: 'FECHADO',
    }
    return { modoDisputa: map[mdUp] ?? mdUp }
  } catch {
    return { modoDisputa: 'ABERTO E FECHADO' }
  }
}

// ─── Scan Room ────────────────────────────────────────────────────────────

function normalizeItem(raw: Record<string, unknown>, modoDisputa: string): DisputeItem {
  const rawFase = String(raw.fase || '').toUpperCase()
  const detalhe = String(raw.detalheSituacaoDisputaItem || '').toUpperCase()
  const isAbertoPuro = modoDisputa === 'ABERTO'

  let fase: DisputeItem['fase'] = 'aberta'
  let status = detalhe || rawFase || 'DESCONHECIDO'
  let tempoSegundos = 0

  const endStr =
    (raw.dataHoraFimContagem as string) ||
    (raw.dataHoraFimEtapaFechada as string) ||
    (raw.dataHoraPrevistaEncerramento as string) ||
    (raw.dataPrevistaFechamento as string)
  const endMs = endStr ? new Date(endStr).getTime() : null
  if (endMs) tempoSegundos = Math.max(0, Math.floor((endMs - Date.now()) / 1000))

  if (rawFase === 'LA') {
    fase = 'aberta'
    if (!detalhe) status = 'RECEBENDO LANCES'
  } else if (rawFase === 'AL') {
    fase = 'randomica'
    tempoSegundos = 999
    if (!detalhe) status = 'RANDÔMICO'
  } else if (rawFase === 'FE' || rawFase === 'LF') {
    if (isAbertoPuro) {
      fase = 'encerrada'
      tempoSegundos = 0
      if (!detalhe) status = 'ENCERRADO'
    } else {
      fase = 'fechada'
      if (!detalhe) status = 'LANCE FINAL (FECHADA)'
    }
  } else if (rawFase === 'E') {
    fase = 'encerrada'
    tempoSegundos = 0
    if (!detalhe) status = 'ENCERRADO'
  } else if (rawFase === 'F') {
    fase = 'aguardando'
    tempoSegundos = 0
    if (!detalhe) status = 'AGUARDANDO DISPUTA'
  } else if (rawFase === 'S') {
    fase = 'aguardando'
    tempoSegundos = 0
    if (!detalhe) status = 'SUSPENSO'
  }

  const melhorGeral = raw.melhorValorGeral as
    | { valorCalculado?: unknown; valorInformado?: unknown }
    | undefined
  const melhorValor = toNumber(
    melhorGeral?.valorCalculado !== undefined
      ? melhorGeral.valorCalculado
      : melhorGeral?.valorInformado,
  )

  const meuGeral = raw.melhorValorFornecedor as
    | { valorCalculado?: unknown; valorInformado?: unknown }
    | undefined
  const seuValor = toNumber(
    meuGeral?.valorCalculado !== undefined ? meuGeral.valorCalculado : meuGeral?.valorInformado,
  )

  const variacaoCrua = toNumber(raw.variacaoMinimaEntreLances)
  const tipoVariacao = String(raw.tipoVariacaoMinimaEntreLances || '').toUpperCase()
  let intervaloMinimo = variacaoCrua
  if (
    variacaoCrua !== null &&
    variacaoCrua > 0 &&
    tipoVariacao === 'P' &&
    melhorValor &&
    melhorValor > 0
  ) {
    intervaloMinimo = Math.ceil((variacaoCrua / 100) * melhorValor * 100) / 100
  }

  const posicaoAtual: 1 | 99 =
    melhorValor !== null && seuValor !== null && seuValor <= melhorValor ? 1 : 99

  return {
    numero: Number(raw.numero),
    lote: padLote(Number(raw.numero)),
    faseOriginal: rawFase,
    fase,
    podeEnviarLances: Boolean(raw.podeEnviarLances) && raw.desclassificado !== true,
    melhorValor,
    seuValor,
    posicaoAtual,
    intervaloMinimo,
    tempoSegundos,
    absoluteEndTime: endMs,
    casasDecimais: 4,
    versaoItem: typeof raw.versaoItem === 'number' ? raw.versaoItem : null,
    versaoParticipante: typeof raw.versaoParticipante === 'number' ? raw.versaoParticipante : null,
    status,
  }
}

/**
 * GET /comprasnet-disputa/v1/compras/:id/itens/em-disputa
 * Expande grupos automaticamente via /itens-grupo.
 */
export async function scanRoom(
  compraId: string,
  accessToken: string,
  modoDisputa: string,
): Promise<DisputeItem[]> {
  const url = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/itens/em-disputa`
  const res = await fetchJSON(url, accessToken)
  if (!res.ok) return []

  const raw = res.data as unknown[] | { itens?: unknown[] } | null
  const arr: Record<string, unknown>[] = Array.isArray(raw)
    ? (raw as Record<string, unknown>[])
    : raw && Array.isArray((raw as { itens?: unknown[] }).itens)
      ? ((raw as { itens: unknown[] }).itens as Record<string, unknown>[])
      : []

  const items: DisputeItem[] = []
  const groupPromises: Promise<void>[] = []

  for (const item of arr) {
    const tipo = item.tipo as string | undefined
    const numero = Number(item.numero)

    if (tipo === 'G' || numero < 0) {
      const groupUrl = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/itens/em-disputa/${numero}/itens-grupo`
      groupPromises.push(
        fetchJSON(groupUrl, accessToken).then((gRes) => {
          if (!gRes.ok) return
          const subArr = Array.isArray(gRes.data)
            ? (gRes.data as Record<string, unknown>[])
            : []
          for (const sub of subArr) items.push(normalizeItem(sub, modoDisputa))
        }),
      )
    } else {
      items.push(normalizeItem(item, modoDisputa))
    }
  }

  if (groupPromises.length > 0) await Promise.all(groupPromises)
  return items
}

// ─── Submit Lance ─────────────────────────────────────────────────────────

export function faseToApiFaseItem(faseOriginal: string): 'LA' | 'LF' | 'AL' {
  const f = (faseOriginal || '').toUpperCase()
  if (f === 'AL') return 'AL'
  if (f === 'FE' || f === 'LF') return 'LF'
  return 'LA'
}

/**
 * POST /comprasnet-disputa/v1/compras/:compraId/itens/:itemId/lances
 * Body: { valorInformado: number (trunc 4 casas), faseItem: 'LA'|'LF'|'AL' }
 */
export async function submitLance(
  compraId: string,
  itemId: number,
  bid: number,
  faseItem: 'LA' | 'LF' | 'AL',
  accessToken: string,
): Promise<ShootResult> {
  const url = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/itens/${itemId}/lances`
  const valor = Math.floor(bid * 10000) / 10000
  const body = JSON.stringify({ valorInformado: valor, faseItem })

  try {
    const res = await fetchJSON(url, accessToken, { method: 'POST', body, timeoutMs: 6000 })

    if (res.status === 200 || res.status === 201) return { sucesso: true, statusHttp: res.status }
    if (res.status === 429) {
      return {
        sucesso: false,
        statusHttp: 429,
        erro: 'HTTP 429 (Too Many Requests). Servidor do Governo pediu pausa.',
        cooldownMs: 4000,
      }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        sucesso: false,
        statusHttp: res.status,
        erro: 'Token expirado. Refresh e retry necessários.',
      }
    }

    const data = res.data as { message?: string; error?: string } | null
    const errMsg = data?.message || data?.error || `HTTP ${res.status}`
    return { sucesso: false, statusHttp: res.status, erro: errMsg, cooldownMs: 2000 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { sucesso: false, erro: `FALHA NO DISPARO: ${msg}` }
  }
}

/**
 * Extrai compraId de URL do Compras.gov.br ou aceita ID bruto.
 */
export function extractCompraId(urlOrId: string): string | null {
  if (!urlOrId) return null
  if (/^\d{10,25}$/.test(urlOrId)) return urlOrId
  try {
    const u = new URL(urlOrId)
    const p = u.searchParams.get('compra')
    if (p) return p
  } catch {
    /* não é URL */
  }
  const m =
    urlOrId.match(/compra=(\d+)/) ||
    urlOrId.match(/\/(\d{10,25})\b/) ||
    urlOrId.match(/(\d{10,25})/)
  return m ? m[1]! : null
}
