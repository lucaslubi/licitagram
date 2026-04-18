import { z } from 'zod'

const BRASILAPI_BASE = 'https://brasilapi.com.br/api/cnpj/v1'

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

export interface CnpjLookupResult {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  naturezaJuridica: string | null
  naturezaCodigo: string | null
  uf: string | null
  municipio: string | null
  codigoIbge: string | null
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

/**
 * Looks up a CNPJ via BrasilAPI (proxy of the official RFB CNPJ database).
 * Free, no auth, ~10 req/min per IP. Times out after 8s.
 */
export async function lookupCnpj(rawCnpj: string): Promise<CnpjLookupResult> {
  const cnpj = normalizeCnpj(rawCnpj)
  if (!isValidCnpj(cnpj)) {
    throw new CnpjLookupError('CNPJ inválido. Verifique os dígitos.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  let res: Response
  try {
    res = await fetch(`${BRASILAPI_BASE}/${cnpj}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
  } catch (e) {
    throw new CnpjLookupError(
      e instanceof Error && e.name === 'AbortError'
        ? 'Tempo esgotado consultando a Receita. Tente novamente.'
        : 'Não foi possível consultar a Receita. Tente novamente.',
    )
  } finally {
    clearTimeout(timeout)
  }

  if (res.status === 404) {
    throw new CnpjLookupError('CNPJ não encontrado na base da Receita.', 404)
  }
  if (!res.ok) {
    throw new CnpjLookupError(`Receita retornou erro ${res.status}.`, res.status)
  }

  const json = await res.json()
  const parsed = BrasilApiResponse.safeParse(json)
  if (!parsed.success) {
    throw new CnpjLookupError('Resposta da Receita em formato inesperado.')
  }

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
  }
}
