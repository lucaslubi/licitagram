/**
 * Compras.gov.br API Driver — SaaS version.
 *
 * Substitui a automação de navegador Playwright por chamadas HTTP direto
 * pros endpoints REST do Compras.gov.br descobertos via engenharia reversa
 * do app web oficial. Mesma abordagem do concorrente LicitaNexus, mas
 * adaptada pra nossa arquitetura SaaS (worker node em VPS, não desktop
 * Electron).
 *
 * Fluxo:
 *   1. Cliente loga uma vez no Compras.gov.br pelo nosso app web
 *   2. Extraímos o JWT (access + refresh) do browser dele via postMessage
 *      ou bookmarklet e salvamos em bot_tokens (encrypted)
 *   3. Worker carrega o token e bate direto na API:
 *         - GET /comprasnet-disputa/v1/compras/:id/participacao (modo disputa)
 *         - GET /comprasnet-disputa/v1/compras/:id/itens/em-disputa (scan)
 *         - POST /comprasnet-disputa/v1/compras/:id/itens/:item/lances (disparo)
 *   4. Auto-refresh quando o access expira (retoken PUT)
 *
 * Latência típica por lance: 50-200ms (vs 3-8s com Playwright). HFT real.
 */

export interface ComprasGovTokens {
  accessToken: string
  refreshToken: string | null
  /** Epoch seconds do exp do access token — cacheado pra evitar decode toda hora */
  accessExp: number
}

export interface ParticipacaoInfo {
  modoDisputa: 'ABERTO' | 'FECHADO' | 'ABERTO E FECHADO' | 'FECHADO E ABERTO' | string
}

export interface DisputeItem {
  /** Nº do item (idServidor nos endpoints) */
  numero: number
  /** Label ex "ITEM 01" */
  lote: string
  /** Fase original do portal: LA/AL/FE/LF/E/F/S */
  faseOriginal: 'LA' | 'AL' | 'FE' | 'LF' | 'E' | 'F' | 'S' | string
  /** Fase mapeada internamente */
  fase: 'aberta' | 'randomica' | 'fechada' | 'encerrada' | 'aguardando' | 'bloqueado' | string
  /** Se o robô pode enviar lances agora */
  podeEnviarLances: boolean
  /** Melhor valor geral do mercado (menor ganha) */
  melhorValor: number | null
  /** Nosso valor atual */
  seuValor: number | null
  /** 1 se estamos na frente, 99 caso contrário */
  posicaoAtual: 1 | 99
  /** Variação mínima entre lances calculada em reais (já absoluta) */
  intervaloMinimo: number | null
  /** Segundos restantes da fase */
  tempoSegundos: number
  /** Data fim da contagem em ms epoch */
  absoluteEndTime: number | null
  /** Casas decimais do lote (2 ou 4) */
  casasDecimais: number
  /** versaoItem/versaoParticipante — necessário em alguns endpoints */
  versaoItem: number | null
  versaoParticipante: number | null
  /** Status textual humanizado */
  status: string
}

export interface ShootResult {
  sucesso: boolean
  erro?: string
  cooldownMs?: number
  statusHttp?: number
}

const COMPRAS_HOST = 'https://cnetmobile.estaleiro.serpro.gov.br'
const DEFAULT_TIMEOUT_MS = 8000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** Decode payload de um JWT sem validação (só precisamos do `exp`) */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const json = Buffer.from(b64, 'base64').toString('utf8')
    return JSON.parse(json)
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
  if (!exp) return false
  const now = Math.floor(Date.now() / 1000)
  return exp > now + bufferSec
}

/** JWT é access ou refresh? Refresh tokens têm id_sessao mas NÃO têm identificacao_fornecedor. */
export function classifyToken(token: string): 'access' | 'refresh' | 'unknown' {
  const p = decodeJwtPayload(token)
  if (!p) return 'unknown'
  if (p.id_sessao !== undefined && p.identificacao_fornecedor === undefined) return 'refresh'
  if (p.identificacao_fornecedor !== undefined) return 'access'
  return 'unknown'
}

/** Fetch com timeout e headers padronizados do Compras.gov.br */
async function authorizedFetch(
  url: string,
  accessToken: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers: initHeaders, ...rest } = init
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'x-device-platform': 'web',
        'x-version-number': '6.0.1',
        ...((initHeaders as Record<string, string>) || {}),
      },
      signal: ctrl.signal,
    })
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      /* resposta não-JSON */
    }
    return { ok: res.ok, status: res.status, data, text }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Refresca o access token usando o refresh.
 * Endpoint: PUT /comprasnet-usuario/v2/sessao/fornecedor/retoken
 * Body vazio, Authorization: Bearer <refreshToken>
 */
export async function refreshToken(
  refreshTokenValue: string,
): Promise<{ accessToken: string; refreshToken: string | null } | null> {
  const url = `${COMPRAS_HOST}/comprasnet-usuario/v2/sessao/fornecedor/retoken`
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Bearer ${refreshTokenValue}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'x-device-platform': 'web',
        'x-version-number': '6.0.1',
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
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
 * Garante access token válido. Tenta refresh se o access expirou.
 * Retorna o token atual (possivelmente renovado) ou null se não conseguir.
 */
export async function ensureAccessToken(
  tokens: ComprasGovTokens,
): Promise<{ accessToken: string; refreshToken: string | null } | null> {
  if (isTokenValid(tokens.accessToken, 30)) {
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
  }
  if (!tokens.refreshToken || !isTokenValid(tokens.refreshToken, 5)) {
    return null
  }
  const refreshed = await refreshToken(tokens.refreshToken)
  if (!refreshed) return null
  return refreshed
}

/**
 * GET /comprasnet-disputa/v1/compras/:id/participacao
 * Retorna modo de disputa (ABERTO, FECHADO, ABERTO E FECHADO, FECHADO E ABERTO)
 */
export async function getParticipacao(
  compraId: string,
  accessToken: string,
): Promise<ParticipacaoInfo> {
  const url = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/participacao`
  const res = await authorizedFetch(url, accessToken)
  if (!res.ok) return { modoDisputa: 'ABERTO E FECHADO' }

  const raw = res.data as { modoDisputa?: string } | Array<{ modoDisputa?: string }> | null
  let md: string | undefined
  if (Array.isArray(raw) && raw.length > 0) md = raw[0]?.modoDisputa
  else if (raw && !Array.isArray(raw)) md = raw.modoDisputa

  if (!md) return { modoDisputa: 'ABERTO E FECHADO' }
  const mdUp = md.toUpperCase()
  const map: Record<string, ParticipacaoInfo['modoDisputa']> = {
    AF: 'ABERTO E FECHADO',
    FA: 'FECHADO E ABERTO',
    A: 'ABERTO',
    F: 'FECHADO',
  }
  return { modoDisputa: map[mdUp] ?? mdUp }
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v)
    .trim()
    .replace(/[^\d.,-]/g, '')
  if (!s) return null
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function padLote(numero: number): string {
  return `ITEM ${String(numero).padStart(2, '0')}`
}

/**
 * Normaliza resposta bruta de um item em disputa pra formato interno.
 *
 * Mapa de fases (copiado do driver do concorrente):
 *   LA → aberta (recebendo lances)
 *   AL → randômica
 *   FE/LF → fechada (se modo=ABERTO E FECHADO) ou encerrada (se modo=ABERTO puro)
 *   E → encerrada
 *   F → aguardando (disputa não começou)
 *   S → suspensa
 */
export function normalizeItem(
  raw: Record<string, unknown>,
  modoDisputa: string,
): DisputeItem {
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

  // Melhor valor geral do mercado
  const melhorGeral = raw.melhorValorGeral as
    | { valorCalculado?: unknown; valorInformado?: unknown }
    | undefined
  const melhorValor = toNumber(
    melhorGeral?.valorCalculado !== undefined ? melhorGeral.valorCalculado : melhorGeral?.valorInformado,
  )

  // Meu melhor lance
  const meuGeral = raw.melhorValorFornecedor as
    | { valorCalculado?: unknown; valorInformado?: unknown }
    | undefined
  const seuValor = toNumber(
    meuGeral?.valorCalculado !== undefined ? meuGeral.valorCalculado : meuGeral?.valorInformado,
  )

  // Intervalo mínimo (pode vir em % — converter pra absoluto)
  const variacaoCrua = toNumber(raw.variacaoMinimaEntreLances)
  const tipoVariacao = String(raw.tipoVariacaoMinimaEntreLances || '').toUpperCase()
  let intervaloMinimo = variacaoCrua
  if (variacaoCrua !== null && variacaoCrua > 0 && tipoVariacao === 'P' && melhorValor && melhorValor > 0) {
    intervaloMinimo = Math.ceil(((variacaoCrua / 100) * melhorValor) * 100) / 100
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
    casasDecimais: 4, // padrão Compras.gov.br
    versaoItem: typeof raw.versaoItem === 'number' ? raw.versaoItem : null,
    versaoParticipante: typeof raw.versaoParticipante === 'number' ? raw.versaoParticipante : null,
    status,
  }
}

/**
 * GET /comprasnet-disputa/v1/compras/:id/itens/em-disputa
 * Lista itens em disputa ativa (exclui aguardando + encerrados).
 *
 * Se o item é grupo (tipo='G' ou numero<0), busca os sub-itens via
 * /itens/em-disputa/:num/itens-grupo e retorna os sub-itens achatados.
 */
export async function scanRoom(
  compraId: string,
  accessToken: string,
  modoDisputa: string,
): Promise<DisputeItem[]> {
  const url = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/itens/em-disputa`
  const res = await authorizedFetch(url, accessToken)
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
      // Item de grupo — busca sub-itens
      const groupUrl = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/itens/em-disputa/${numero}/itens-grupo`
      groupPromises.push(
        authorizedFetch(groupUrl, accessToken).then((gRes) => {
          if (!gRes.ok) return
          const subArr = Array.isArray(gRes.data) ? (gRes.data as Record<string, unknown>[]) : []
          for (const sub of subArr) {
            items.push(normalizeItem(sub, modoDisputa))
          }
        }),
      )
    } else {
      items.push(normalizeItem(item, modoDisputa))
    }
  }

  if (groupPromises.length > 0) await Promise.all(groupPromises)
  return items
}

/**
 * POST /comprasnet-disputa/v1/compras/:compraId/itens/:itemId/lances
 * Payload: { valorInformado: number, faseItem: 'LA'|'LF'|'AL' }
 *
 * Precisa respeitar 4 casas decimais (floor pra não arredondar pra cima).
 */
export async function submitLance(
  compraId: string,
  itemId: number,
  bid: number,
  faseItem: 'LA' | 'LF' | 'AL',
  accessToken: string,
): Promise<ShootResult> {
  const url = `${COMPRAS_HOST}/comprasnet-disputa/v1/compras/${compraId}/itens/${itemId}/lances`
  const valor = Math.floor(bid * 10000) / 10000 // trunca em 4 decimais
  const body = JSON.stringify({ valorInformado: valor, faseItem })

  try {
    const res = await authorizedFetch(url, accessToken, {
      method: 'POST',
      body,
      timeoutMs: 6000,
    })

    if (res.status === 200 || res.status === 201) {
      return { sucesso: true, statusHttp: res.status }
    }
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
 * Converte a fase interna em `faseItem` que a API aceita no payload.
 * LA → 'LA' (lances abertos)
 * AL → 'AL' (randômica)
 * FE/LF → 'LF' (lance final, mesmo que tenha vindo como FE)
 */
export function faseToApiFaseItem(faseOriginal: string): 'LA' | 'LF' | 'AL' {
  const f = (faseOriginal || '').toUpperCase()
  if (f === 'AL') return 'AL'
  if (f === 'FE' || f === 'LF') return 'LF'
  return 'LA'
}

/**
 * Extrai o compraId de uma URL do Compras.gov.br.
 * Suporta:
 *   ?compra=<id>
 *   /compra=<id>
 *   qualquer número de 10-25 dígitos na URL
 *   string pura de dígitos
 */
export function extractCompraId(urlOrId: string): string | null {
  if (!urlOrId) return null
  // Se já é só número
  if (/^\d{10,25}$/.test(urlOrId)) return urlOrId
  try {
    const u = new URL(urlOrId)
    const p = u.searchParams.get('compra')
    if (p) return p
  } catch {
    /* não é URL válida */
  }
  const m = urlOrId.match(/compra=(\d+)/) || urlOrId.match(/\/(\d{10,25})\b/) || urlOrId.match(/(\d{10,25})/)
  return m ? m[1]! : null
}
