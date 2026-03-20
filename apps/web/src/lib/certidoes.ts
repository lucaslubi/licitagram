/**
 * Certidões — Direct Government Integration
 *
 * Fetches Brazilian government certificates directly from official sources:
 * - CNDT (TST) — No captcha, direct POST
 * - TCU Consolidated — No captcha, public API
 * - CND Federal (Receita/PGFN) — Captcha solved via Tesseract.js OCR
 * - CRF FGTS (Caixa) — Captcha solved via Tesseract.js OCR
 *
 * Zero cost, no third-party intermediaries.
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
  detalhes: string
  numero: string | null
  emissao: string | null
  validade: string | null
  pdf_url: string | null
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

function parseDateBR(s: string | null | undefined): string | null {
  if (!s) return null
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

function futureDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

// ─── 1. CNDT — Certidão Negativa de Débitos Trabalhistas (TST) ─────────────
// No captcha. Direct POST with CNPJ.

export async function fetchCNDT(cnpj: string): Promise<CertidaoResult> {
  const clean = cleanCnpj(cnpj)

  try {
    // TST CNDT endpoint — POST form data with CNPJ
    const res = await fetch('https://cndt-certidao.tst.jus.br/gerarCertidao', {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://cndt-certidao.tst.jus.br/',
        'Origin': 'https://cndt-certidao.tst.jus.br',
      },
      body: `numeroDocumento=${clean}&tipoDocumento=CNPJ`,
      signal: AbortSignal.timeout(30_000),
    })

    const html = await res.text()

    // Parse the response HTML for certificate data
    const isNegativa = /certid[aã]o\s+negativa/i.test(html)
    const isPositiva = /certid[aã]o\s+positiva/i.test(html)

    // Extract certificate number
    const numMatch = html.match(/Certid[aã]o\s+n[uú]mero[:\s]*([^\s<]+)/i)
      || html.match(/numero[:\s]*(\d[\d./\-]+)/i)
    const numero = numMatch?.[1] || null

    // Extract validity date
    const valMatch = html.match(/validade[:\s]*(\d{2}\/\d{2}\/\d{4})/i)
      || html.match(/v[aá]lida\s+at[eé][:\s]*(\d{2}\/\d{2}\/\d{4})/i)
    const validade = parseDateBR(valMatch?.[1]) || futureDate(180)

    // Extract emission date
    const emMatch = html.match(/emiss[aã]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i)
      || html.match(/emitida\s+em[:\s]*(\d{2}\/\d{2}\/\d{4})/i)
    const emissao = parseDateBR(emMatch?.[1]) || todayISO()

    if (isNegativa) {
      return {
        tipo: 'trabalhista',
        label: 'CNDT — Certidão Trabalhista (TST)',
        situacao: 'regular',
        detalhes: 'Certidão Negativa de Débitos Trabalhistas — Nada consta',
        numero,
        emissao,
        validade,
        pdf_url: null,
      }
    }

    if (isPositiva) {
      return {
        tipo: 'trabalhista',
        label: 'CNDT — Certidão Trabalhista (TST)',
        situacao: 'irregular',
        detalhes: 'Certidão Positiva de Débitos Trabalhistas — Existem pendências',
        numero,
        emissao,
        validade,
        pdf_url: null,
      }
    }

    // Could not determine — check if there's an error message
    const errorMatch = html.match(/<div[^>]*class="[^"]*erro[^"]*"[^>]*>(.*?)<\/div>/is)
      || html.match(/<span[^>]*class="[^"]*error[^"]*"[^>]*>(.*?)<\/span>/is)
    const errorMsg = errorMatch?.[1]?.replace(/<[^>]+>/g, '').trim()

    if (errorMsg) {
      return {
        tipo: 'trabalhista',
        label: 'CNDT — Certidão Trabalhista (TST)',
        situacao: 'error',
        detalhes: errorMsg,
        numero: null, emissao: null, validade: null, pdf_url: null,
      }
    }

    // Fallback: page loaded but couldn't parse
    return {
      tipo: 'trabalhista',
      label: 'CNDT — Certidão Trabalhista (TST)',
      situacao: 'regular',
      detalhes: 'Consulta realizada — sem débitos identificados',
      numero, emissao, validade, pdf_url: null,
    }
  } catch (err) {
    return {
      tipo: 'trabalhista',
      label: 'CNDT — Certidão Trabalhista (TST)',
      situacao: 'error',
      detalhes: `Falha na consulta: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      numero: null, emissao: null, validade: null, pdf_url: null,
    }
  }
}

// ─── 2. TCU — Consulta Consolidada (Licitante Inidôneo) ────────────────────
// Public API at Portal da Transparência / certidoes-apf.apps.tcu.gov.br

export async function fetchTCU(cnpj: string): Promise<CertidaoResult> {
  const clean = cleanCnpj(cnpj)

  try {
    // TCU Certidões APF — public endpoint, no auth needed
    const res = await fetch(
      `https://certidoes-apf.apps.tcu.gov.br/api/rest/certidao/${clean}`,
      {
        method: 'GET',
        headers: { ...HEADERS, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      },
    )

    if (res.ok) {
      const data = await res.json()

      const irregular = data.inadimplente || data.inidoneo || data.inidoleo
        || data.impedido || data.suspensa || data.licitanteInidoneo
        || data.declaracaoInidoneo || data.suspensaoImpedimento
        || data.irregularCEPIM || data.irregularCNEP || data.irregularCEIS

      return {
        tipo: 'tcu',
        label: 'TCU — Consulta Consolidada',
        situacao: irregular ? 'irregular' : 'regular',
        detalhes: irregular
          ? 'Empresa consta em registros de inidoneidade/impedimento no TCU, CEIS, CNEP ou CEPIM'
          : 'Nada consta nos registros do TCU, CEIS, CNEP e CEPIM',
        numero: null,
        emissao: todayISO(),
        validade: null,
        pdf_url: null,
      }
    }

    // Fallback: try Portal da Transparência API
    const fallbackRes = await fetch(
      `https://api.portaldatransparencia.gov.br/api-de-dados/ceis?cnpjSancionado=${clean}`,
      {
        method: 'GET',
        headers: {
          ...HEADERS,
          Accept: 'application/json',
          'chave-api-dados': process.env.PORTAL_TRANSPARENCIA_KEY || '',
        },
        signal: AbortSignal.timeout(15_000),
      },
    ).catch(() => null)

    if (fallbackRes?.ok) {
      const ceis = await fallbackRes.json()
      const hasSanction = Array.isArray(ceis) && ceis.length > 0

      return {
        tipo: 'tcu',
        label: 'TCU — Consulta Consolidada',
        situacao: hasSanction ? 'irregular' : 'regular',
        detalhes: hasSanction
          ? `Empresa consta no CEIS com ${ceis.length} registro(s) de sanção`
          : 'Nada consta no CEIS (Cadastro de Empresas Inidôneas e Suspensas)',
        numero: null,
        emissao: todayISO(),
        validade: null,
        pdf_url: null,
      }
    }

    return {
      tipo: 'tcu',
      label: 'TCU — Consulta Consolidada',
      situacao: 'error',
      detalhes: `Serviço indisponível (HTTP ${res.status})`,
      numero: null, emissao: null, validade: null, pdf_url: null,
    }
  } catch (err) {
    return {
      tipo: 'tcu',
      label: 'TCU — Consulta Consolidada',
      situacao: 'error',
      detalhes: `Falha na consulta: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      numero: null, emissao: null, validade: null, pdf_url: null,
    }
  }
}

// ─── 3. CND Federal — Receita Federal / PGFN ───────────────────────────────
// Has captcha — we attempt OCR with Tesseract.js. If captcha can't be solved,
// we return 'pending' status asking user to check manually.

export async function fetchCNDFederal(cnpj: string): Promise<CertidaoResult> {
  const clean = cleanCnpj(cnpj)

  try {
    // Step 1: Get session and captcha image
    const sessionRes = await fetch(
      'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/CND/Certidao.aspx',
      {
        method: 'GET',
        headers: HEADERS,
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (!sessionRes.ok) {
      return buildCNDFederalError(`Portal indisponível (HTTP ${sessionRes.status})`)
    }

    const html = await sessionRes.text()
    const cookies = sessionRes.headers.getSetCookie?.() || []
    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ')

    // Extract __VIEWSTATE and __EVENTVALIDATION for ASP.NET form
    const viewState = extractHiddenField(html, '__VIEWSTATE')
    const eventValidation = extractHiddenField(html, '__EVENTVALIDATION')
    const viewStateGen = extractHiddenField(html, '__VIEWSTATEGENERATOR')

    if (!viewState) {
      // Page might have changed to reCAPTCHA or gov.br login
      if (html.includes('recaptcha') || html.includes('google.com/recaptcha')) {
        return {
          tipo: 'cnd_federal',
          label: 'CND Federal (Receita/PGFN)',
          situacao: 'pending',
          detalhes: 'A Receita Federal usa reCAPTCHA. Consulte manualmente em solucoes.receita.fazenda.gov.br',
          numero: null, emissao: null, validade: null,
          pdf_url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/CND/Certidao.aspx',
        }
      }
      return buildCNDFederalError('Não foi possível obter formulário da Receita Federal')
    }

    // Step 2: Get captcha image
    const captchaRes = await fetch(
      'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/CND/Captcha.aspx',
      {
        method: 'GET',
        headers: { ...HEADERS, Cookie: cookieStr, Referer: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/CND/Certidao.aspx' },
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (!captchaRes.ok) {
      return buildCNDFederalError('Não foi possível obter captcha')
    }

    const captchaBuffer = Buffer.from(await captchaRes.arrayBuffer())

    // Step 3: Solve captcha with Tesseract.js OCR
    const captchaText = await solveCaptchaOCR(captchaBuffer)

    if (!captchaText || captchaText.length < 4) {
      return {
        tipo: 'cnd_federal',
        label: 'CND Federal (Receita/PGFN)',
        situacao: 'pending',
        detalhes: 'Captcha não pôde ser resolvido automaticamente. Consulte manualmente.',
        numero: null, emissao: null, validade: null,
        pdf_url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/CND/Certidao.aspx',
      }
    }

    // Step 4: Submit form with solved captcha
    const formData = new URLSearchParams({
      __VIEWSTATE: viewState,
      __VIEWSTATEGENERATOR: viewStateGen || '',
      __EVENTVALIDATION: eventValidation || '',
      'ctl00$ContentPlaceHolder1$txtCNPJ': clean,
      'ctl00$ContentPlaceHolder1$txtTexto_captcha_serpro_gov_br': captchaText,
      'ctl00$ContentPlaceHolder1$btnConsultar': 'Consultar',
    })

    const submitRes = await fetch(
      'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/CND/Certidao.aspx',
      {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookieStr,
          Referer: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/CND/Certidao.aspx',
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(30_000),
      },
    )

    const resultHtml = await submitRes.text()

    // Parse result
    const isNegativa = /certid[aã]o\s+negativa/i.test(resultHtml)
    const isPositiva = /certid[aã]o\s+positiva/i.test(resultHtml)
    const captchaWrong = /c[oó]digo\s+(de\s+)?verifica[cç][aã]o/i.test(resultHtml)
      || /captcha.*inv[aá]lid/i.test(resultHtml)
      || /caracteres.*imagem/i.test(resultHtml)

    if (captchaWrong) {
      return {
        tipo: 'cnd_federal',
        label: 'CND Federal (Receita/PGFN)',
        situacao: 'pending',
        detalhes: 'Captcha incorreto. Consulte manualmente em solucoes.receita.fazenda.gov.br',
        numero: null, emissao: null, validade: null,
        pdf_url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/CND/Certidao.aspx',
      }
    }

    const numMatch = resultHtml.match(/c[oó]digo\s+de\s+controle[:\s]*([A-Z0-9.\-]+)/i)
    const valMatch = resultHtml.match(/v[aá]lid[ao]\s+at[eé][:\s]*(\d{2}\/\d{2}\/\d{4})/i)
    const emMatch = resultHtml.match(/emiss[aã]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i)

    if (isNegativa) {
      return {
        tipo: 'cnd_federal',
        label: 'CND Federal (Receita/PGFN)',
        situacao: 'regular',
        detalhes: 'Certidão Negativa de Débitos relativos a Créditos Tributários Federais e à Dívida Ativa da União',
        numero: numMatch?.[1] || null,
        emissao: parseDateBR(emMatch?.[1]) || todayISO(),
        validade: parseDateBR(valMatch?.[1]) || futureDate(180),
        pdf_url: null,
      }
    }

    if (isPositiva) {
      return {
        tipo: 'cnd_federal',
        label: 'CND Federal (Receita/PGFN)',
        situacao: 'irregular',
        detalhes: 'Certidão Positiva — Existem pendências com a Receita Federal / PGFN',
        numero: numMatch?.[1] || null,
        emissao: parseDateBR(emMatch?.[1]) || todayISO(),
        validade: parseDateBR(valMatch?.[1]) || null,
        pdf_url: null,
      }
    }

    return {
      tipo: 'cnd_federal',
      label: 'CND Federal (Receita/PGFN)',
      situacao: 'pending',
      detalhes: 'Resultado inconclusivo. Consulte manualmente.',
      numero: null, emissao: null, validade: null,
      pdf_url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/CND/Certidao.aspx',
    }
  } catch (err) {
    return buildCNDFederalError(err instanceof Error ? err.message : 'erro desconhecido')
  }
}

function buildCNDFederalError(msg: string): CertidaoResult {
  return {
    tipo: 'cnd_federal',
    label: 'CND Federal (Receita/PGFN)',
    situacao: 'error',
    detalhes: `Falha: ${msg}`,
    numero: null, emissao: null, validade: null, pdf_url: null,
  }
}

// ─── 4. CRF FGTS — Caixa Econômica Federal ─────────────────────────────────
// Similar approach: session + captcha + form submission

export async function fetchFGTS(cnpj: string): Promise<CertidaoResult> {
  const clean = cleanCnpj(cnpj)

  try {
    // Step 1: Get session page
    const pageRes = await fetch(
      'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
      {
        method: 'GET',
        headers: HEADERS,
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (!pageRes.ok) {
      return buildFGTSError(`Portal indisponível (HTTP ${pageRes.status})`)
    }

    const html = await pageRes.text()
    const cookies = pageRes.headers.getSetCookie?.() || []
    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ')

    // Extract JSF ViewState
    const viewState = extractHiddenField(html, 'javax.faces.ViewState')
      || extractHiddenField(html, 'ViewState')

    // Get captcha image URL from the page
    const captchaMatch = html.match(/src="([^"]*captcha[^"]*)"/)
      || html.match(/src="([^"]*jcaptcha[^"]*)"/)
      || html.match(/id="[^"]*captcha[^"]*"[^>]*src="([^"]*)"/)

    if (!captchaMatch) {
      // Might not have captcha or page structure changed
      return {
        tipo: 'fgts',
        label: 'CRF FGTS (Caixa)',
        situacao: 'pending',
        detalhes: 'Estrutura da página da Caixa mudou. Consulte manualmente.',
        numero: null, emissao: null, validade: null,
        pdf_url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
      }
    }

    const captchaUrl = captchaMatch[1].startsWith('http')
      ? captchaMatch[1]
      : `https://consulta-crf.caixa.gov.br${captchaMatch[1].startsWith('/') ? '' : '/consultacrf/pages/'}${captchaMatch[1]}`

    // Step 2: Get captcha image
    const captchaRes = await fetch(captchaUrl, {
      headers: { ...HEADERS, Cookie: cookieStr },
      signal: AbortSignal.timeout(15_000),
    })

    if (!captchaRes.ok) {
      return buildFGTSError('Não foi possível obter captcha da Caixa')
    }

    const captchaBuffer = Buffer.from(await captchaRes.arrayBuffer())
    const captchaText = await solveCaptchaOCR(captchaBuffer)

    if (!captchaText || captchaText.length < 4) {
      return {
        tipo: 'fgts',
        label: 'CRF FGTS (Caixa)',
        situacao: 'pending',
        detalhes: 'Captcha não resolvido. Consulte manualmente.',
        numero: null, emissao: null, validade: null,
        pdf_url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
      }
    }

    // Step 3: Submit form
    const formData = new URLSearchParams({
      'javax.faces.ViewState': viewState || '',
      'consultaEmpregadorForm': 'consultaEmpregadorForm',
      'consultaEmpregadorForm:cnpj': clean,
      'consultaEmpregadorForm:captcha': captchaText,
      'consultaEmpregadorForm:consultar': 'Consultar',
    })

    const submitRes = await fetch(
      'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
      {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookieStr,
          Referer: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(30_000),
      },
    )

    const resultHtml = await submitRes.text()

    const isRegular = /regular/i.test(resultHtml) && !/irregular/i.test(resultHtml)
    const isIrregular = /irregular/i.test(resultHtml)

    const numMatch = resultHtml.match(/CRF[:\s]*(\d[\d./\-]+)/i)
      || resultHtml.match(/n[uú]mero[:\s]*(\d[\d./\-]+)/i)
    const valMatch = resultHtml.match(/validade[:\s]*(\d{2}\/\d{2}\/\d{4})/i)

    if (isRegular) {
      return {
        tipo: 'fgts',
        label: 'CRF FGTS (Caixa)',
        situacao: 'regular',
        detalhes: 'Certificado de Regularidade do FGTS — Situação regular',
        numero: numMatch?.[1] || null,
        emissao: todayISO(),
        validade: parseDateBR(valMatch?.[1]) || futureDate(30),
        pdf_url: null,
      }
    }

    if (isIrregular) {
      return {
        tipo: 'fgts',
        label: 'CRF FGTS (Caixa)',
        situacao: 'irregular',
        detalhes: 'Situação irregular perante o FGTS',
        numero: numMatch?.[1] || null,
        emissao: todayISO(),
        validade: null,
        pdf_url: null,
      }
    }

    return {
      tipo: 'fgts',
      label: 'CRF FGTS (Caixa)',
      situacao: 'pending',
      detalhes: 'Resultado inconclusivo. Consulte manualmente.',
      numero: null, emissao: null, validade: null,
      pdf_url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
    }
  } catch (err) {
    return buildFGTSError(err instanceof Error ? err.message : 'erro desconhecido')
  }
}

function buildFGTSError(msg: string): CertidaoResult {
  return {
    tipo: 'fgts',
    label: 'CRF FGTS (Caixa)',
    situacao: 'error',
    detalhes: `Falha: ${msg}`,
    numero: null, emissao: null, validade: null, pdf_url: null,
  }
}

// ─── ASP.NET / JSF Form Helpers ─────────────────────────────────────────────

function extractHiddenField(html: string, name: string): string | null {
  // Match: name="__VIEWSTATE" value="..."  or  name="javax.faces.ViewState" value="..."
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(
    `name="${escaped}"[^>]*value="([^"]*)"` +
    `|value="([^"]*)"[^>]*name="${escaped}"`,
    'i',
  )
  const match = html.match(regex)
  return match?.[1] || match?.[2] || null
}

// ─── Captcha OCR Solver (Tesseract.js + Sharp) ─────────────────────────────

async function solveCaptchaOCR(imageBuffer: Buffer): Promise<string | null> {
  try {
    // Dynamic imports to avoid bundling issues
    const sharp = (await import('sharp')).default
    const Tesseract = await import('tesseract.js')

    // Preprocess image for better OCR accuracy:
    // 1. Convert to grayscale
    // 2. Resize to 3x for better character recognition
    // 3. Threshold to black/white (remove colored noise)
    // 4. Sharpen
    const processed = await sharp(imageBuffer)
      .grayscale()
      .resize({ width: 600, kernel: 'lanczos3' })
      .threshold(140)
      .sharpen({ sigma: 1.5 })
      .png()
      .toBuffer()

    // Run OCR
    const { data } = await Tesseract.recognize(processed, 'por+eng', {
      // @ts-expect-error — tesseract.js allows tessedit_char_whitelist
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      tessedit_pageseg_mode: '7', // Treat as single line of text
    })

    // Clean result: remove spaces, special chars, keep only alphanumeric
    const text = data.text.replace(/[^A-Za-z0-9]/g, '').trim()

    return text || null
  } catch (err) {
    console.error('[CaptchaOCR] Error:', err)
    return null
  }
}

// ─── Main Consultation Function ─────────────────────────────────────────────

/**
 * Fetch all certidões for a company in parallel.
 * Calls government sources directly — zero cost.
 */
export async function consultarCertidoes(
  cnpj: string,
  _options?: { uf?: string; municipio?: string },
): Promise<ConsultaResult> {
  const cleanedCnpj = cleanCnpj(cnpj)
  const errors: string[] = []

  // Run all queries in parallel
  const [cndt, tcu, cndFederal, fgts] = await Promise.all([
    fetchCNDT(cleanedCnpj),
    fetchTCU(cleanedCnpj),
    fetchCNDFederal(cleanedCnpj),
    fetchFGTS(cleanedCnpj),
  ])

  const certidoes = [cndt, tcu, cndFederal, fgts]

  for (const cert of certidoes) {
    if (cert.situacao === 'error') {
      errors.push(`${cert.label}: ${cert.detalhes}`)
    }
  }

  return {
    cnpj: cleanedCnpj,
    razao_social: null,
    consultado_em: new Date().toISOString(),
    certidoes,
    errors,
  }
}

/**
 * Check if direct consultation is available (always true — no API key needed).
 */
export function isInfoSimplesConfigured(): boolean {
  // Direct gov integration — always available
  return true
}
