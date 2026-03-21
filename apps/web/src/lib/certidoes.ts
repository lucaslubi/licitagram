/**
 * Certidões — Direct Government Integration
 *
 * Fetches Brazilian government certificates directly from official sources.
 *
 * AUTO (no captcha):
 * - TCU/CEIS/CNEP — Portal da Transparência JSON endpoint (sanctions check)
 *
 * AUTO (captcha-solving via CapSolver on VPS worker):
 * - CNDT (TST) — Custom image captcha → CapSolver ImageToTextTask
 * - CND Federal (Receita/PGFN) — hCaptcha → CapSolver HCaptchaTaskProxyLess
 * - CRF FGTS (Caixa) — captcha → CapSolver
 *
 * FALLBACK (manual links when auto fails):
 * - Returns direct government URLs for manual consultation
 *
 * env: CAPSOLVER_API_KEY (on VPS worker — enables captcha solving)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CertidaoTipo =
  | 'cnd_federal'
  | 'cnd_estadual'
  | 'cnd_municipal'
  | 'fgts'
  | 'trabalhista'
  | 'tcu'

export type CertidaoSituacao = 'regular' | 'irregular' | 'error' | 'pending' | 'manual'

export interface CertidaoResult {
  tipo: CertidaoTipo
  label: string
  situacao: CertidaoSituacao
  detalhes: string
  numero: string | null
  emissao: string | null
  validade: string | null
  pdf_url: string | null
  /** Direct link for user to consult manually (when captcha blocks automation) */
  consulta_url: string | null
}

export interface ConsultaResult {
  cnpj: string
  razao_social: string | null
  consultado_em: string
  certidoes: CertidaoResult[]
  errors: string[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '')
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

// ─── 1. TCU / CEIS / CNEP — Portal da Transparência ────────────────────────
// Public JSON endpoint, no auth or captcha needed.

export async function fetchTCU(cnpj: string): Promise<CertidaoResult> {
  const clean = cleanCnpj(cnpj)

  try {
    const res = await fetch(
      `https://portaldatransparencia.gov.br/sancoes/consulta/resultado?` +
      `paginacaoSimples=true&tamanhoPagina=10&offset=0&direcaoOrdenacao=asc` +
      `&colunaOrdenacao=nomeSancionado&cpfCnpj=${clean}`,
      {
        method: 'GET',
        headers: {
          ...HEADERS,
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(20_000),
      },
    )

    if (!res.ok) {
      return {
        tipo: 'tcu',
        label: 'TCU / CEIS / CNEP — Sanções',
        situacao: 'error',
        detalhes: `Serviço indisponível (HTTP ${res.status})`,
        numero: null, emissao: null, validade: null, pdf_url: null, consulta_url: null,
      }
    }

    const data = await res.json()
    const total = data.recordsTotal || data.recordsFiltered || 0
    const records = data.data || []

    // Check if any record has actual sanction data
    const hasSanctions = records.some((r: Record<string, unknown>) =>
      r.nomeSancionado || r.orgao || r.dataInicialSancao,
    )

    if (total === 0 || !hasSanctions) {
      return {
        tipo: 'tcu',
        label: 'TCU / CEIS / CNEP — Sanções',
        situacao: 'regular',
        detalhes: 'Nada consta nos cadastros CEIS, CNEP e CEPIM do Portal da Transparência',
        numero: null,
        emissao: todayISO(),
        validade: null,
        pdf_url: null,
        consulta_url: `https://portaldatransparencia.gov.br/sancoes/consulta?cpfCnpj=${clean}`,
      }
    }

    // Build details from sanctions
    const sanctions = records
      .filter((r: Record<string, unknown>) => r.nomeSancionado)
      .map((r: Record<string, unknown>) => {
        const parts: string[] = []
        if (r.cadastro) parts.push(r.cadastro as string)
        if (r.orgao) parts.push(`Órgão: ${r.orgao}`)
        if (r.dataInicialSancao) parts.push(`Desde: ${r.dataInicialSancao}`)
        return parts.join(' — ')
      })
      .filter(Boolean)

    return {
      tipo: 'tcu',
      label: 'TCU / CEIS / CNEP — Sanções',
      situacao: 'irregular',
      detalhes: `Empresa consta com ${total} registro(s) de sanção. ${sanctions.slice(0, 3).join('; ')}`,
      numero: null,
      emissao: todayISO(),
      validade: null,
      pdf_url: null,
      consulta_url: `https://portaldatransparencia.gov.br/sancoes/consulta?cpfCnpj=${clean}`,
    }
  } catch (err) {
    return {
      tipo: 'tcu',
      label: 'TCU / CEIS / CNEP — Sanções',
      situacao: 'error',
      detalhes: `Falha: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      numero: null, emissao: null, validade: null, pdf_url: null, consulta_url: null,
    }
  }
}

// ─── 2. CNDT — Certidão Trabalhista (TST) ──────────────────────────────────
// Uses reCAPTCHA — cannot be automated. Returns direct link.

export function buildCNDTManual(cnpj: string): CertidaoResult {
  return {
    tipo: 'trabalhista',
    label: 'CNDT — Certidão Trabalhista (TST)',
    situacao: 'manual',
    detalhes: 'Acesse o link abaixo, informe o CNPJ e resolva o captcha para emitir.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: 'https://cndt-certidao.tst.jus.br/inicio.faces',
  }
}

// ─── 3. CND Federal — Receita Federal / PGFN ───────────────────────────────
// Uses hCaptcha — cannot be automated. Returns direct link.

export function buildCNDFederalManual(cnpj: string): CertidaoResult {
  return {
    tipo: 'cnd_federal',
    label: 'CND Federal (Receita/PGFN)',
    situacao: 'manual',
    detalhes: 'Acesse o link abaixo, informe o CNPJ e resolva o captcha para emitir.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: 'https://servicos.receitafederal.gov.br/servico/certidoes/',
  }
}

// ─── 4. CRF FGTS — Caixa Econômica ─────────────────────────────────────────
// Uses captcha — cannot be automated. Returns direct link.

export function buildFGTSManual(cnpj: string): CertidaoResult {
  return {
    tipo: 'fgts',
    label: 'CRF FGTS (Caixa)',
    situacao: 'manual',
    detalhes: 'Acesse o link abaixo, informe o CNPJ e resolva o captcha para emitir.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
  }
}

// ─── 5. CND Estadual — SEFAZ ───────────────────────────────────────────────

const SEFAZ_URLS: Record<string, string> = {
  AC: 'https://sefaznet.ac.gov.br/nfeweb/EmitirCertidaoNegativa.xhtml',
  AL: 'https://www.sefaz.al.gov.br/certidao-negativa',
  AM: 'https://online.sefaz.am.gov.br/certidao',
  AP: 'https://www.sefaz.ap.gov.br/certidao-negativa',
  BA: 'https://www.sefaz.ba.gov.br/scripts/cadastro/cadastroBa/certidao.asp',
  CE: 'https://servicos.sefaz.ce.gov.br/internet/download/CertidaoNegativa',
  DF: 'https://www2.agnet.fazenda.df.gov.br/portal/certidaonegativa',
  ES: 'https://internet.sefaz.es.gov.br/certidoes/',
  GO: 'https://www.economia.go.gov.br/certidao-negativa.html',
  MA: 'https://sistemas1.sefaz.ma.gov.br/portalsefaz/jsp/certidao/certidaoNegativa.jsf',
  MG: 'https://www.fazenda.mg.gov.br/empresas/certidao-de-debitos/',
  MS: 'https://servicos.efazenda.ms.gov.br/certidaonegativa',
  MT: 'https://www.sefaz.mt.gov.br/portal/certidao',
  PA: 'https://app.sefa.pa.gov.br/certidao-negativa/',
  PB: 'https://www.sefaz.pb.gov.br/certidao-negativa',
  PE: 'https://www.sefaz.pe.gov.br/Servicos/certidao-negativa/',
  PI: 'https://webas.sefaz.pi.gov.br/certidaonegativa/',
  PR: 'https://www.fazenda.pr.gov.br/servicos/Receita/Certidao-Negativa-Debitos',
  RJ: 'https://portal.fazenda.rj.gov.br/certidao/',
  RN: 'https://www.set.rn.gov.br/certidaonegativa',
  RO: 'https://www.sefin.ro.gov.br/certidao-negativa',
  RR: 'https://www.sefaz.rr.gov.br/certidao-negativa',
  RS: 'https://www.sefaz.rs.gov.br/sat/CertidaoSitFiscalSolic.aspx',
  SC: 'https://tributario.sef.sc.gov.br/tax.NET/sat.certidao.aspx',
  SE: 'https://www.sefaz.se.gov.br/certidao-negativa',
  SP: 'https://www10.fazenda.sp.gov.br/CertidaoNegativaDeb/Pages/EmissaoCertidaoNegativa.aspx',
  TO: 'https://www.sefaz.to.gov.br/certidao-negativa',
}

export function buildCNDEstadualManual(cnpj: string, uf?: string): CertidaoResult {
  const ufUpper = (uf || '').toUpperCase()
  const url = SEFAZ_URLS[ufUpper] || null

  return {
    tipo: 'cnd_estadual',
    label: `CND Estadual (SEFAZ ${ufUpper || '—'})`,
    situacao: 'manual',
    detalhes: url
      ? `Acesse o link da SEFAZ ${ufUpper} abaixo para emitir a certidão.`
      : 'UF não identificada. Acesse a SEFAZ do seu estado para emitir.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: url,
  }
}

// ─── Main Consultation Function ─────────────────────────────────────────────

/**
 * Fetch certidões for a company.
 *
 * Strategy:
 * 1. TCU/CEIS/CNEP: Always automatic (no captcha)
 * 2. CNDT, CND Federal, FGTS: Try auto (captcha-solving) first, fallback to manual
 * 3. CND Estadual: Always manual (too many state variations)
 *
 * @param autoSolve - Whether to attempt captcha-solving (default: true)
 */
export async function consultarCertidoes(
  cnpj: string,
  options?: { uf?: string; municipio?: string; autoSolve?: boolean },
): Promise<ConsultaResult> {
  const cleanedCnpj = cleanCnpj(cnpj)
  const errors: string[] = []
  const shouldAutoSolve = options?.autoSolve !== false

  // 1. Automatic: TCU/CEIS/CNEP check (always works)
  const tcu = await fetchTCU(cleanedCnpj)
  if (tcu.situacao === 'error') {
    errors.push(`${tcu.label}: ${tcu.detalhes}`)
  }

  // 2. Captcha-protected certidões: try auto, fallback to manual
  let cndt: CertidaoResult
  let cndFederal: CertidaoResult
  let fgts: CertidaoResult

  if (shouldAutoSolve) {
    try {
      const { consultarCertidoesAuto } = await import('./certidoes-auto')
      const autoResult = await consultarCertidoesAuto(cleanedCnpj, options)

      // Map auto results by tipo
      const autoMap = new Map(autoResult.certidoes.map((c) => [c.tipo, c]))

      cndt = autoMap.get('trabalhista') || buildCNDTManual(cleanedCnpj)
      cndFederal = autoMap.get('cnd_federal') || buildCNDFederalManual(cleanedCnpj)
      fgts = autoMap.get('fgts') || buildFGTSManual(cleanedCnpj)

      errors.push(...autoResult.errors)
    } catch (err) {
      console.error('[certidoes] Auto-solve module error, falling back to manual:', err)
      cndt = buildCNDTManual(cleanedCnpj)
      cndFederal = buildCNDFederalManual(cleanedCnpj)
      fgts = buildFGTSManual(cleanedCnpj)
    }
  } else {
    cndt = buildCNDTManual(cleanedCnpj)
    cndFederal = buildCNDFederalManual(cleanedCnpj)
    fgts = buildFGTSManual(cleanedCnpj)
  }

  // 3. CND Estadual: always manual (too many state-specific forms)
  const cndEstadual = buildCNDEstadualManual(cleanedCnpj, options?.uf)

  const certidoes = [tcu, cndFederal, fgts, cndt, cndEstadual]

  return {
    cnpj: cleanedCnpj,
    razao_social: null,
    consultado_em: new Date().toISOString(),
    certidoes,
    errors,
  }
}

/**
 * Always available — no API keys needed.
 */
export function isInfoSimplesConfigured(): boolean {
  return true
}
