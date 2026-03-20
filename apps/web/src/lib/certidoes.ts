/**
 * Certidões Integration Service
 *
 * Integrates with InfoSimples API to automatically fetch Brazilian government
 * certificates (certidões) required for licitação qualification (habilitação).
 *
 * Supported certidões:
 * - CND Federal (Receita Federal / PGFN)
 * - CRF FGTS (Caixa Econômica Federal)
 * - CNDT (TST — Certidão Negativa de Débitos Trabalhistas)
 * - CND Estadual (SEFAZ de cada estado)
 * - CND Municipal (prefeituras)
 * - TCU (Certidão Negativa de Licitante Inidôneo)
 *
 * Provider: InfoSimples (https://infosimples.com)
 * Docs: https://infosimples.com/consultas/
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CertidaoTipo =
  | 'cnd_federal'
  | 'cnd_estadual'
  | 'cnd_municipal'
  | 'fgts'
  | 'trabalhista'
  | 'tcu'

export interface CertidaoResult {
  tipo: CertidaoTipo
  label: string
  situacao: 'regular' | 'irregular' | 'error' | 'pending'
  /** The certificate text/status from the government source */
  detalhes: string
  /** Certificate number, if available */
  numero: string | null
  /** Emission date */
  emissao: string | null
  /** Expiration date (ISO string yyyy-mm-dd) */
  validade: string | null
  /** Download URL for the PDF certificate, if available */
  pdf_url: string | null
  /** Raw API response for debugging */
  raw?: unknown
}

export interface ConsultaResult {
  cnpj: string
  razao_social: string | null
  consultado_em: string
  certidoes: CertidaoResult[]
  errors: string[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INFOSIMPLES_BASE = 'https://api.infosimples.com/api/v2'
const INFOSIMPLES_TOKEN = process.env.INFOSIMPLES_API_TOKEN || ''

/** Map our internal types to InfoSimples API endpoints */
const CERTIDAO_ENDPOINTS: Record<CertidaoTipo, {
  path: string
  label: string
  /** Extra params to send */
  extraParams?: Record<string, string>
}> = {
  cnd_federal: {
    path: '/consultas/receita-federal/pgfn',
    label: 'CND Federal (Receita/PGFN)',
  },
  fgts: {
    path: '/consultas/caixa/regularidade',
    label: 'CRF FGTS (Caixa)',
  },
  trabalhista: {
    path: '/consultas/tst/cndt',
    label: 'CNDT - Certidão Trabalhista (TST)',
  },
  cnd_estadual: {
    path: '/consultas/sefaz/{uf}/certidao-negativa',
    label: 'CND Estadual (SEFAZ)',
  },
  cnd_municipal: {
    path: '/consultas/prefeitura/{municipio}/certidao-negativa',
    label: 'CND Municipal',
  },
  tcu: {
    path: '/consultas/tcu/inidoleo',
    label: 'TCU - Licitante Inidôneo',
  },
}

/** Certidões that can be fetched for any company (no state/city dependency) */
export const CERTIDOES_FEDERAIS: CertidaoTipo[] = [
  'cnd_federal',
  'fgts',
  'trabalhista',
  'tcu',
]

/** All available certidão types */
export const ALL_CERTIDAO_TIPOS: CertidaoTipo[] = [
  'cnd_federal',
  'fgts',
  'trabalhista',
  'cnd_estadual',
  'cnd_municipal',
  'tcu',
]

// ─── InfoSimples API Helpers ────────────────────────────────────────────────

async function callInfoSimples(
  path: string,
  cnpj: string,
  extraParams?: Record<string, string>,
): Promise<{ success: boolean; data: Record<string, unknown> | null; error?: string }> {
  if (!INFOSIMPLES_TOKEN) {
    return { success: false, data: null, error: 'INFOSIMPLES_API_TOKEN não configurado' }
  }

  try {
    const params = new URLSearchParams({
      token: INFOSIMPLES_TOKEN,
      cnpj: cnpj.replace(/\D/g, ''),
      ...extraParams,
    })

    const res = await fetch(`${INFOSIMPLES_BASE}${path}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000), // 60s — some certs take time (captcha solving)
    })

    if (!res.ok) {
      return { success: false, data: null, error: `HTTP ${res.status}: ${res.statusText}` }
    }

    const json = await res.json()

    // InfoSimples returns code 200 for success, other codes for errors
    if (json.code === 200 || json.code === '200') {
      return { success: true, data: json.data?.[0] || json.data || json }
    }

    return {
      success: false,
      data: json,
      error: json.code_message || json.message || `Código ${json.code}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return { success: false, data: null, error: msg }
  }
}

// ─── Individual Certidão Fetchers ───────────────────────────────────────────

function parseDateBR(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  // Handle dd/mm/yyyy
  const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (parts) return `${parts[3]}-${parts[2]}-${parts[1]}`
  // Handle yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10)
  return null
}

export async function fetchCNDFederal(cnpj: string): Promise<CertidaoResult> {
  const { success, data, error } = await callInfoSimples(
    '/consultas/receita-federal/pgfn',
    cnpj,
  )

  if (!success || !data) {
    return {
      tipo: 'cnd_federal',
      label: 'CND Federal (Receita/PGFN)',
      situacao: 'error',
      detalhes: error || 'Falha na consulta',
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
    }
  }

  const situacao = determineSituacao(data)

  return {
    tipo: 'cnd_federal',
    label: 'CND Federal (Receita/PGFN)',
    situacao,
    detalhes: (data.situacao as string) || (data.resultado as string) || 'Consulta realizada',
    numero: (data.codigo_controle as string) || (data.numero as string) || null,
    emissao: parseDateBR(data.data_emissao as string),
    validade: parseDateBR(data.data_validade as string),
    pdf_url: (data.site_receipt as string) || null,
    raw: data,
  }
}

export async function fetchFGTS(cnpj: string): Promise<CertidaoResult> {
  const { success, data, error } = await callInfoSimples(
    '/consultas/caixa/regularidade',
    cnpj,
  )

  if (!success || !data) {
    return {
      tipo: 'fgts',
      label: 'CRF FGTS (Caixa)',
      situacao: 'error',
      detalhes: error || 'Falha na consulta',
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
    }
  }

  const situacaoText = ((data.situacao as string) || '').toLowerCase()
  const situacao = situacaoText.includes('regular') ? 'regular' : 'irregular'

  return {
    tipo: 'fgts',
    label: 'CRF FGTS (Caixa)',
    situacao,
    detalhes: (data.situacao as string) || 'Consulta realizada',
    numero: (data.numero_crf as string) || (data.numero as string) || null,
    emissao: parseDateBR(data.data_emissao as string),
    validade: parseDateBR(data.data_validade as string),
    pdf_url: (data.site_receipt as string) || null,
    raw: data,
  }
}

export async function fetchCNDT(cnpj: string): Promise<CertidaoResult> {
  const { success, data, error } = await callInfoSimples(
    '/consultas/tst/cndt',
    cnpj,
  )

  if (!success || !data) {
    return {
      tipo: 'trabalhista',
      label: 'CNDT (TST)',
      situacao: 'error',
      detalhes: error || 'Falha na consulta',
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
    }
  }

  const resultado = ((data.resultado as string) || (data.certidao as string) || '').toLowerCase()
  const situacao = resultado.includes('negativa') && !resultado.includes('positiva')
    ? 'regular'
    : 'irregular'

  return {
    tipo: 'trabalhista',
    label: 'CNDT (TST)',
    situacao,
    detalhes: (data.resultado as string) || (data.certidao as string) || 'Consulta realizada',
    numero: (data.numero as string) || (data.codigo as string) || null,
    emissao: parseDateBR(data.data_emissao as string),
    validade: parseDateBR(data.data_validade as string),
    pdf_url: (data.site_receipt as string) || null,
    raw: data,
  }
}

export async function fetchTCU(cnpj: string): Promise<CertidaoResult> {
  const { success, data, error } = await callInfoSimples(
    '/consultas/tcu/consolidada',
    cnpj,
  )

  if (!success || !data) {
    return {
      tipo: 'tcu',
      label: 'TCU - Licitante Inidôneo',
      situacao: 'error',
      detalhes: error || 'Falha na consulta',
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
    }
  }

  // TCU returns whether the entity is inidônea/impedida/suspensa
  const inidoleo = data.inidoneo || data.inidoleo || data.impedido || data.suspensa
  const situacao = inidoleo ? 'irregular' : 'regular'

  return {
    tipo: 'tcu',
    label: 'TCU - Licitante Inidôneo',
    situacao,
    detalhes: inidoleo
      ? 'Empresa consta como inidônea/impedida nos registros do TCU'
      : 'Nada consta nos registros do TCU',
    numero: null,
    emissao: new Date().toISOString().slice(0, 10),
    validade: null,
    pdf_url: (data.site_receipt as string) || null,
    raw: data,
  }
}

export async function fetchCNDEstadual(cnpj: string, uf: string): Promise<CertidaoResult> {
  const ufLower = uf.toLowerCase()
  const { success, data, error } = await callInfoSimples(
    `/consultas/sefaz/${ufLower}/certidao-negativa`,
    cnpj,
  )

  if (!success || !data) {
    return {
      tipo: 'cnd_estadual',
      label: `CND Estadual (SEFAZ ${uf.toUpperCase()})`,
      situacao: 'error',
      detalhes: error || 'Falha na consulta',
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
    }
  }

  const situacao = determineSituacao(data)

  return {
    tipo: 'cnd_estadual',
    label: `CND Estadual (SEFAZ ${uf.toUpperCase()})`,
    situacao,
    detalhes: (data.situacao as string) || (data.resultado as string) || 'Consulta realizada',
    numero: (data.numero as string) || null,
    emissao: parseDateBR(data.data_emissao as string),
    validade: parseDateBR(data.data_validade as string),
    pdf_url: (data.site_receipt as string) || null,
    raw: data,
  }
}

// ─── Main Consultation Function ─────────────────────────────────────────────

/**
 * Fetch all certidões for a company in parallel.
 * This is the main entry point — queries all federal certidões
 * plus state/municipal if UF and municipio are available.
 */
export async function consultarCertidoes(
  cnpj: string,
  options?: { uf?: string; municipio?: string },
): Promise<ConsultaResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')
  const errors: string[] = []

  // Federal certidões — always fetched
  const promises: Promise<CertidaoResult>[] = [
    fetchCNDFederal(cleanCnpj),
    fetchFGTS(cleanCnpj),
    fetchCNDT(cleanCnpj),
    fetchTCU(cleanCnpj),
  ]

  // State certidão — if UF available
  if (options?.uf) {
    promises.push(fetchCNDEstadual(cleanCnpj, options.uf))
  }

  const certidoes = await Promise.all(promises)

  // Collect errors
  for (const cert of certidoes) {
    if (cert.situacao === 'error') {
      errors.push(`${cert.label}: ${cert.detalhes}`)
    }
  }

  return {
    cnpj: cleanCnpj,
    razao_social: null,
    consultado_em: new Date().toISOString(),
    certidoes,
    errors,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function determineSituacao(data: Record<string, unknown>): 'regular' | 'irregular' {
  const text = (
    (data.situacao as string) ||
    (data.resultado as string) ||
    (data.certidao as string) ||
    ''
  ).toLowerCase()

  if (text.includes('negativa') && !text.includes('positiva')) return 'regular'
  if (text.includes('regular')) return 'regular'
  if (text.includes('positiva') || text.includes('irregular') || text.includes('pendente')) return 'irregular'
  // Default to regular if we can't determine (API returned data without error)
  return 'regular'
}

/**
 * Check if InfoSimples integration is configured.
 */
export function isInfoSimplesConfigured(): boolean {
  return !!INFOSIMPLES_TOKEN
}
