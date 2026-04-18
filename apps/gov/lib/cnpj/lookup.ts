import { z } from 'zod'

const BRASILAPI_BASE = 'https://brasilapi.com.br/api/cnpj/v1'
const RECEITAWS_BASE = 'https://www.receitaws.com.br/v1/cnpj'

const BrasilApiResponse = z.object({
  cnpj: z.string(),
  razao_social: z.string().nullable().default(''),
  nome_fantasia: z.string().nullable().default(''),
  natureza_juridica: z.string().nullable().default(''),
  codigo_natureza_juridica: z.union([z.string(), z.number()]).nullable().optional(),
  uf: z.string().nullable().default(''),
  municipio: z.string().nullable().default(''),
  codigo_municipio_ibge: z.union([z.string(), z.number()]).nullable().optional(),
  logradouro: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  ddd_telefone_1: z.string().nullable().optional(),
})

// ReceitaWS shape: status string + flat fields, natureza_juridica encoded as
// "<codigo> - <descricao>".
const ReceitaWsResponse = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  cnpj: z.string().optional(),
  nome: z.string().optional(),
  fantasia: z.string().optional(),
  natureza_juridica: z.string().optional(),
  uf: z.string().optional(),
  municipio: z.string().optional(),
})

export interface CnpjLookupResult {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  naturezaJuridica: string | null
  naturezaCodigo: string | null
  uf: string | null
  municipio: string | null
  codigoIbge: string | null
  source: 'brasilapi' | 'receitaws'
}

/** Strip non-digits from a CNPJ input. */
export function normalizeCnpj(input: string): string {
  return input.replace(/\D/g, '')
}

/** Validate CNPJ check digits (Modulo 11). */
export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (slice: string, weights: number[]): number => {
    const sum = slice.split('').reduce((acc, d, i) => acc + Number(d) * (weights[i] ?? 0), 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = calc(cnpj.slice(0, 12), w1)
  const d2 = calc(cnpj.slice(0, 12) + d1, w2)
  return cnpj.endsWith(`${d1}${d2}`)
}

export class CnpjLookupError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'CnpjLookupError'
  }
}

interface FetchOpts {
  url: string
  timeoutMs?: number
}

async function fetchWithTimeout({ url, timeoutMs = 8_000 }: FetchOpts): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'LicitaGramGov/1.0 (+https://gov.licitagram.com)' },
      cache: 'no-store',
    })
  } finally {
    clearTimeout(timer)
  }
}

async function tryBrasilApi(cnpj: string): Promise<CnpjLookupResult | { error: string; retryable: boolean }> {
  let res: Response
  try {
    res = await fetchWithTimeout({ url: `${BRASILAPI_BASE}/${cnpj}` })
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { error: aborted ? 'BrasilAPI: timeout' : 'BrasilAPI: network', retryable: true }
  }
  if (res.status === 404) {
    return { error: 'CNPJ não encontrado na base da Receita.', retryable: false }
  }
  if (res.status === 403 || res.status === 429 || res.status >= 500) {
    return { error: `BrasilAPI ${res.status}`, retryable: true }
  }
  if (!res.ok) {
    return { error: `BrasilAPI ${res.status}`, retryable: false }
  }
  const json = await res.json().catch(() => null)
  const parsed = BrasilApiResponse.safeParse(json)
  if (!parsed.success) return { error: 'BrasilAPI: payload inválido', retryable: true }
  const naturezaCodigo =
    parsed.data.codigo_natureza_juridica != null
      ? String(parsed.data.codigo_natureza_juridica).replace(/\D/g, '')
      : null
  return {
    cnpj,
    razaoSocial: parsed.data.razao_social ?? '',
    nomeFantasia: parsed.data.nome_fantasia || null,
    naturezaJuridica: parsed.data.natureza_juridica || null,
    naturezaCodigo,
    uf: parsed.data.uf || null,
    municipio: parsed.data.municipio || null,
    codigoIbge:
      parsed.data.codigo_municipio_ibge != null
        ? String(parsed.data.codigo_municipio_ibge)
        : null,
    source: 'brasilapi',
  }
}

async function tryReceitaWs(cnpj: string): Promise<CnpjLookupResult | { error: string; retryable: boolean }> {
  let res: Response
  try {
    res = await fetchWithTimeout({ url: `${RECEITAWS_BASE}/${cnpj}` })
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { error: aborted ? 'ReceitaWS: timeout' : 'ReceitaWS: network', retryable: true }
  }
  if (res.status === 429 || res.status === 403 || res.status >= 500) {
    return { error: `ReceitaWS ${res.status}`, retryable: true }
  }
  if (!res.ok) return { error: `ReceitaWS ${res.status}`, retryable: false }
  const json = await res.json().catch(() => null)
  const parsed = ReceitaWsResponse.safeParse(json)
  if (!parsed.success) return { error: 'ReceitaWS: payload inválido', retryable: true }
  if (parsed.data.status && parsed.data.status.toUpperCase() !== 'OK') {
    return { error: parsed.data.message || 'CNPJ não encontrado.', retryable: false }
  }
  // Extract leading numeric code from "1031 - Órgão Público..."
  const naturezaStr = parsed.data.natureza_juridica ?? ''
  const codeMatch = naturezaStr.match(/^(\d+)/)
  return {
    cnpj,
    razaoSocial: parsed.data.nome ?? '',
    nomeFantasia: parsed.data.fantasia || null,
    naturezaJuridica: naturezaStr || null,
    naturezaCodigo: codeMatch ? codeMatch[1] ?? null : null,
    uf: parsed.data.uf || null,
    municipio: parsed.data.municipio || null,
    codigoIbge: null,
    source: 'receitaws',
  }
}

function isResult(x: unknown): x is CnpjLookupResult {
  return typeof x === 'object' && x !== null && 'razaoSocial' in x && 'source' in x
}

/**
 * Tries BrasilAPI first (richer payload, faster). Falls back to ReceitaWS on
 * 403/429/5xx/timeout — useful because BrasilAPI sometimes blocks Vercel
 * datacenter IPs. If both fail, throws CnpjLookupError so the wizard can
 * offer manual entry.
 */
export async function lookupCnpj(rawCnpj: string): Promise<CnpjLookupResult> {
  const cnpj = normalizeCnpj(rawCnpj)
  if (!isValidCnpj(cnpj)) {
    throw new CnpjLookupError('CNPJ inválido. Verifique os dígitos.')
  }

  const a = await tryBrasilApi(cnpj)
  if (isResult(a)) return a
  if (!a.retryable) throw new CnpjLookupError(a.error)

  const b = await tryReceitaWs(cnpj)
  if (isResult(b)) return b
  if (!b.retryable) throw new CnpjLookupError(b.error)

  throw new CnpjLookupError(
    'Receita indisponível no momento. Você pode preencher os dados do órgão manualmente.',
  )
}
