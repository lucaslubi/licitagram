/**
 * Certidões — Automated Captcha-Solving Integration
 *
 * Automates government certidão fetching by solving captchas:
 *
 * 1. TST (CNDT) — Custom image captcha → OCR (Tesseract.js) or 2Captcha
 * 2. Receita Federal (CND) — hCaptcha → 2Captcha
 * 3. Caixa (FGTS CRF) — Captcha → 2Captcha
 *
 * Falls back to manual links if captcha solving fails.
 */

import type { CertidaoResult } from './certidoes'

// ─── Config ─────────────────────────────────────────────────────────────────

const TWO_CAPTCHA_KEY = process.env.TWO_CAPTCHA_API_KEY || ''

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Check if automated captcha solving is available.
 */
export function isAutoSolveAvailable(): boolean {
  return !!TWO_CAPTCHA_KEY
}

// ─── 2Captcha Helpers ───────────────────────────────────────────────────────

interface CaptchaSolution {
  text?: string
  token?: string
}

/**
 * Solve a normal image captcha via 2Captcha.
 */
async function solveImageCaptcha(base64Image: string): Promise<string | null> {
  if (!TWO_CAPTCHA_KEY) return null

  try {
    const { Solver } = await import('2captcha-ts')
    const solver = new Solver(TWO_CAPTCHA_KEY)

    const result = await solver.imageCaptcha({
      body: base64Image,
      numeric: 0,
      lang: 'pt',
    })

    return result?.data || null
  } catch (err) {
    console.error('[certidoes-auto] 2Captcha image solve error:', err)
    return null
  }
}

/**
 * Solve hCaptcha via 2Captcha.
 */
async function solveHCaptcha(siteKey: string, pageUrl: string): Promise<string | null> {
  if (!TWO_CAPTCHA_KEY) return null

  try {
    const { Solver } = await import('2captcha-ts')
    const solver = new Solver(TWO_CAPTCHA_KEY)

    const result = await solver.hcaptcha({
      sitekey: siteKey,
      pageurl: pageUrl,
    })

    return result?.data || null
  } catch (err) {
    console.error('[certidoes-auto] 2Captcha hCaptcha solve error:', err)
    return null
  }
}

/**
 * Try OCR with Tesseract.js (free, no API key needed).
 */
async function solveWithOCR(base64Image: string): Promise<string | null> {
  try {
    const Tesseract = await import('tesseract.js')
    const worker = await Tesseract.createWorker('eng')

    // Preprocess with sharp for better OCR accuracy
    const sharp = (await import('sharp')).default
    const imgBuffer = Buffer.from(base64Image, 'base64')

    const processed = await sharp(imgBuffer)
      .greyscale()
      .normalize()
      .threshold(128)
      .sharpen()
      .toBuffer()

    const {
      data: { text },
    } = await worker.recognize(processed)
    await worker.terminate()

    // Clean OCR result: remove whitespace and non-alphanumeric
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').trim()
    return cleaned.length >= 4 ? cleaned : null
  } catch (err) {
    console.error('[certidoes-auto] OCR error:', err)
    return null
  }
}

// ─── TST (CNDT) — Automated ─────────────────────────────────────────────────
// Flow: inicio.faces → gerarCertidao.faces (custom image captcha)

/**
 * Extract JSF ViewState from HTML.
 */
function extractViewState(html: string): string | null {
  const match = html.match(/name="javax\.faces\.ViewState"\s+value="([^"]+)"/)
  return match?.[1] || null
}

/**
 * Extract captcha image (base64) and token from TST form.
 */
function extractCaptchaData(html: string): { imageBase64: string | null; token: string | null } {
  // The image is embedded as base64 data URI
  const imgMatch = html.match(/id="idImgBase64"[^>]*src="data:image\/[^;]+;base64,([^"]+)"/)
  const imageBase64 = imgMatch?.[1] || null

  // Token is in a hidden input
  const tokenMatch = html.match(/name="tokenDesafio"\s+value="([^"]*)"/)
    || html.match(/id="tokenDesafio"\s+value="([^"]*)"/)
  const token = tokenMatch?.[1] || null

  return { imageBase64, token }
}

/**
 * Parse CNDT result from response HTML.
 */
function parseCNDTResult(html: string): Partial<CertidaoResult> {
  // Check for "Certidão Negativa" = regular
  if (html.includes('Certidão Negativa de Débitos Trabalhistas') || html.includes('CNDT')) {
    // Extract certidão number
    const numMatch = html.match(/(?:Certidão\s+nº|N[úu]mero)[:\s]*(\d[\d./-]+)/i)
    const numero = numMatch?.[1]?.trim() || null

    // Extract validade
    const valMatch = html.match(/(?:Validade|Válida?\s+até)[:\s]*(\d{2}\/\d{2}\/\d{4})/i)
    let validade: string | null = null
    if (valMatch?.[1]) {
      const [d, m, y] = valMatch[1].split('/')
      validade = `${y}-${m}-${d}` // ISO format
    }

    // Check if it's negative (regular) or positive (irregular)
    const isNegativa = html.includes('Certidão Negativa') && !html.includes('Certidão Positiva')

    return {
      situacao: isNegativa ? 'regular' : 'irregular',
      detalhes: isNegativa
        ? 'Certidão Negativa de Débitos Trabalhistas emitida com sucesso'
        : 'Certidão Positiva — existem débitos trabalhistas',
      numero,
      validade,
      emissao: todayISO(),
    }
  }

  // Check for error messages
  if (html.includes('captcha') || html.includes('incorreto') || html.includes('inválido')) {
    return {
      situacao: 'error',
      detalhes: 'Captcha incorreto ou sessão expirada',
    }
  }

  return {
    situacao: 'error',
    detalhes: 'Não foi possível interpretar a resposta do TST',
  }
}

/**
 * Attempt automated CNDT fetch via TST.
 * Strategy: OCR first (free), fallback to 2Captcha.
 */
export async function fetchCNDTAuto(cnpj: string): Promise<CertidaoResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')
  const baseUrl = 'https://cndt-certidao.tst.jus.br'

  try {
    // Step 1: Load the initial page to get session cookie
    const initRes = await fetch(`${baseUrl}/inicio.faces`, {
      method: 'GET',
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    if (!initRes.ok) {
      throw new Error(`TST inicio.faces HTTP ${initRes.status}`)
    }

    // Extract cookies from response
    const cookies = initRes.headers.getSetCookie?.() || []
    const cookieStr = cookies.map((c) => c.split(';')[0]).join('; ')

    const initHtml = await initRes.text()
    const viewState1 = extractViewState(initHtml)

    if (!viewState1) {
      throw new Error('ViewState not found on inicio.faces')
    }

    // Step 2: Navigate to gerarCertidao.faces
    // The TST form requires submitting the initial page first
    const navBody = new URLSearchParams({
      'javax.faces.ViewState': viewState1,
      'formulario': 'formulario',
      'formulario:btnConsultar': 'Consultar',
    })

    const navRes = await fetch(`${baseUrl}/inicio.faces`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieStr,
        Referer: `${baseUrl}/inicio.faces`,
      },
      body: navBody.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    const navHtml = await navRes.text()

    // Check if we landed on the certidão form
    const formHtml = navHtml.includes('gerarCertidaoForm') ? navHtml : null

    if (!formHtml) {
      // Maybe we need to follow another redirect or the form is in a different page
      const certRes = await fetch(`${baseUrl}/gerarCertidao.faces`, {
        method: 'GET',
        headers: {
          ...HEADERS,
          Cookie: cookieStr,
          Referer: `${baseUrl}/inicio.faces`,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      })

      if (!certRes.ok) {
        throw new Error(`TST gerarCertidao.faces HTTP ${certRes.status}`)
      }

      const certHtml = await certRes.text()
      return await processTSTForm(certHtml, cleanCnpj, cookieStr, baseUrl)
    }

    return await processTSTForm(formHtml, cleanCnpj, cookieStr, baseUrl)
  } catch (err) {
    console.error('[certidoes-auto] TST fetch error:', err)
    return {
      tipo: 'trabalhista',
      label: 'CNDT — Certidão Trabalhista (TST)',
      situacao: 'error',
      detalhes: `Falha na consulta automática: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
      consulta_url: 'https://cndt-certidao.tst.jus.br/inicio.faces',
    }
  }
}

async function processTSTForm(
  html: string,
  cnpj: string,
  cookies: string,
  baseUrl: string,
): Promise<CertidaoResult> {
  const viewState = extractViewState(html)
  const { imageBase64, token } = extractCaptchaData(html)

  if (!viewState || !imageBase64) {
    throw new Error('Could not extract captcha form data from TST')
  }

  // Try OCR first (free)
  let captchaAnswer = await solveWithOCR(imageBase64)

  // If OCR fails or looks unreliable, try 2Captcha
  if (!captchaAnswer && TWO_CAPTCHA_KEY) {
    captchaAnswer = await solveImageCaptcha(imageBase64)
  }

  if (!captchaAnswer) {
    return {
      tipo: 'trabalhista',
      label: 'CNDT — Certidão Trabalhista (TST)',
      situacao: 'manual',
      detalhes: 'Não foi possível resolver o captcha automaticamente. Use o link para consulta manual.',
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
      consulta_url: 'https://cndt-certidao.tst.jus.br/inicio.faces',
    }
  }

  // Submit the form
  const formBody = new URLSearchParams({
    'javax.faces.ViewState': viewState,
    'gerarCertidaoForm': 'gerarCertidaoForm',
    'gerarCertidaoForm:cpfCnpj': cnpj,
    'resposta': captchaAnswer,
    'tokenDesafio': token || '',
    'gerarCertidaoForm:btnEmitirCertidao': 'Emitir Certidão',
  })

  const submitRes = await fetch(`${baseUrl}/gerarCertidao.faces`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies,
      Referer: `${baseUrl}/gerarCertidao.faces`,
    },
    body: formBody.toString(),
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })

  const resultHtml = await submitRes.text()
  const parsed = parseCNDTResult(resultHtml)

  // Check for PDF link
  let pdfUrl: string | null = null
  const pdfMatch = resultHtml.match(/href="([^"]*\.pdf[^"]*)"/)
  if (pdfMatch?.[1]) {
    pdfUrl = pdfMatch[1].startsWith('http') ? pdfMatch[1] : `${baseUrl}${pdfMatch[1]}`
  }

  return {
    tipo: 'trabalhista',
    label: 'CNDT — Certidão Trabalhista (TST)',
    situacao: parsed.situacao || 'error',
    detalhes: parsed.detalhes || 'Resultado não identificado',
    numero: parsed.numero || null,
    emissao: parsed.emissao || todayISO(),
    validade: parsed.validade || null,
    pdf_url: pdfUrl,
    consulta_url: `https://cndt-certidao.tst.jus.br/inicio.faces`,
  }
}

// ─── Receita Federal (CND) — Automated ──────────────────────────────────────
// Uses hCaptcha → requires 2Captcha

// Known hCaptcha sitekeys for Receita Federal
const RECEITA_HCAPTCHA_SITEKEY = 'e03e1b68-3adc-4715-871f-c1e55f498fb8'
const RECEITA_CND_URL = 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir'

export async function fetchCNDFederalAuto(cnpj: string): Promise<CertidaoResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')

  if (!TWO_CAPTCHA_KEY) {
    return {
      tipo: 'cnd_federal',
      label: 'CND Federal (Receita/PGFN)',
      situacao: 'manual',
      detalhes: 'Chave 2Captcha não configurada. Use o link para consulta manual.',
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
      consulta_url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
    }
  }

  try {
    // Solve hCaptcha
    const hCaptchaToken = await solveHCaptcha(RECEITA_HCAPTCHA_SITEKEY, RECEITA_CND_URL)

    if (!hCaptchaToken) {
      throw new Error('hCaptcha solve failed')
    }

    // Load the page first to get any hidden tokens
    const pageRes = await fetch(RECEITA_CND_URL, {
      method: 'GET',
      headers: HEADERS,
      signal: AbortSignal.timeout(15_000),
    })

    const pageHtml = await pageRes.text()
    const cookies = pageRes.headers.getSetCookie?.() || []
    const cookieStr = cookies.map((c) => c.split(';')[0]).join('; ')

    // Extract __RequestVerificationToken (ASP.NET)
    const tokenMatch = pageHtml.match(/name="__RequestVerificationToken"\s+value="([^"]+)"/)
    const verificationToken = tokenMatch?.[1] || ''

    // Submit with hCaptcha token
    const formBody = new URLSearchParams({
      NI: cleanCnpj,
      'h-captcha-response': hCaptchaToken,
      'g-recaptcha-response': hCaptchaToken, // Some forms accept both names
      __RequestVerificationToken: verificationToken,
    })

    const submitRes = await fetch(RECEITA_CND_URL, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieStr,
        Referer: RECEITA_CND_URL,
      },
      body: formBody.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })

    const resultHtml = await submitRes.text()

    // Parse the result
    return parseReceitaResult(resultHtml)
  } catch (err) {
    console.error('[certidoes-auto] Receita Federal error:', err)
    return {
      tipo: 'cnd_federal',
      label: 'CND Federal (Receita/PGFN)',
      situacao: 'error',
      detalhes: `Falha na consulta automática: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
      consulta_url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
    }
  }
}

function parseReceitaResult(html: string): CertidaoResult {
  const base: Omit<CertidaoResult, 'situacao' | 'detalhes'> = {
    tipo: 'cnd_federal',
    label: 'CND Federal (Receita/PGFN)',
    numero: null,
    emissao: todayISO(),
    validade: null,
    pdf_url: null,
    consulta_url: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
  }

  // Check for Certidão Negativa
  if (html.includes('Certidão Negativa') || html.includes('CERTIDÃO NEGATIVA')) {
    const numMatch = html.match(/Código de Controle[:\s]*(\w[\w.-]+)/i)
    const valMatch = html.match(/Válida?\s+até[:\s]*(\d{2}\/\d{2}\/\d{4})/i)

    let validade: string | null = null
    if (valMatch?.[1]) {
      const [d, m, y] = valMatch[1].split('/')
      validade = `${y}-${m}-${d}`
    }

    return {
      ...base,
      situacao: 'regular',
      detalhes: 'Certidão Negativa de Débitos emitida pela Receita Federal/PGFN',
      numero: numMatch?.[1] || null,
      validade,
    }
  }

  // Check for Certidão Positiva
  if (html.includes('Certidão Positiva') || html.includes('CERTIDÃO POSITIVA')) {
    const isComEfeito = html.includes('com Efeitos de Negativa') || html.includes('COM EFEITOS DE NEGATIVA')
    return {
      ...base,
      situacao: isComEfeito ? 'regular' : 'irregular',
      detalhes: isComEfeito
        ? 'Certidão Positiva com Efeitos de Negativa (débitos com exigibilidade suspensa)'
        : 'Certidão Positiva — existem débitos junto à Receita Federal/PGFN',
    }
  }

  return {
    ...base,
    situacao: 'error',
    detalhes: 'Não foi possível interpretar a resposta da Receita Federal',
  }
}

// ─── FGTS (Caixa) — Automated ───────────────────────────────────────────────
// JSF form with captcha

const FGTS_URL = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'

export async function fetchFGTSAuto(cnpj: string): Promise<CertidaoResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')

  try {
    // Load the form page
    const pageRes = await fetch(FGTS_URL, {
      method: 'GET',
      headers: HEADERS,
      signal: AbortSignal.timeout(15_000),
    })

    if (!pageRes.ok) throw new Error(`FGTS page HTTP ${pageRes.status}`)

    const pageHtml = await pageRes.text()
    const cookies = pageRes.headers.getSetCookie?.() || []
    const cookieStr = cookies.map((c) => c.split(';')[0]).join('; ')

    const viewState = extractViewState(pageHtml)
    if (!viewState) throw new Error('ViewState not found on FGTS page')

    // Extract captcha image
    const captchaImgMatch = pageHtml.match(/id="[^"]*captcha[^"]*"[^>]*src="data:image\/[^;]+;base64,([^"]+)"/)
      || pageHtml.match(/id="[^"]*captcha[^"]*"[^>]*src="([^"]+)"/)

    let captchaAnswer: string | null = null

    if (captchaImgMatch?.[1]) {
      const isBase64 = !captchaImgMatch[1].startsWith('http')

      if (isBase64) {
        // Try OCR first
        captchaAnswer = await solveWithOCR(captchaImgMatch[1])
        if (!captchaAnswer && TWO_CAPTCHA_KEY) {
          captchaAnswer = await solveImageCaptcha(captchaImgMatch[1])
        }
      } else {
        // Fetch captcha image
        const imgRes = await fetch(
          captchaImgMatch[1].startsWith('http')
            ? captchaImgMatch[1]
            : `https://consulta-crf.caixa.gov.br${captchaImgMatch[1]}`,
          {
            headers: { ...HEADERS, Cookie: cookieStr },
            signal: AbortSignal.timeout(10_000),
          },
        )
        const imgBuf = Buffer.from(await imgRes.arrayBuffer())
        const imgBase64 = imgBuf.toString('base64')

        captchaAnswer = await solveWithOCR(imgBase64)
        if (!captchaAnswer && TWO_CAPTCHA_KEY) {
          captchaAnswer = await solveImageCaptcha(imgBase64)
        }
      }
    }

    if (!captchaAnswer) {
      return {
        tipo: 'fgts',
        label: 'CRF FGTS (Caixa)',
        situacao: 'manual',
        detalhes: 'Captcha não pôde ser resolvido automaticamente. Use o link para consulta manual.',
        numero: null,
        emissao: null,
        validade: null,
        pdf_url: null,
        consulta_url: FGTS_URL,
      }
    }

    // Submit the form (field names may vary — using common patterns)
    const formBody = new URLSearchParams({
      'javax.faces.ViewState': viewState,
    })

    // Try to extract form field names
    const cnpjFieldMatch = pageHtml.match(/id="([^"]*cnpj[^"]*)"[^>]*type="text"/i)
      || pageHtml.match(/id="([^"]*inscricao[^"]*)"[^>]*type="text"/i)
    const captchaFieldMatch = pageHtml.match(/id="([^"]*captcha[^"]*)"[^>]*type="text"/i)
      || pageHtml.match(/id="([^"]*resposta[^"]*)"[^>]*type="text"/i)
    const submitMatch = pageHtml.match(/id="([^"]*consultar[^"]*)"[^>]*type="submit"/i)
      || pageHtml.match(/id="([^"]*btn[^"]*)"[^>]*type="submit"/i)

    const cnpjField = cnpjFieldMatch?.[1]?.replace(/:/g, ':') || 'form:cnpj'
    const captchaField = captchaFieldMatch?.[1]?.replace(/:/g, ':') || 'form:captcha'
    const submitBtn = submitMatch?.[1]?.replace(/:/g, ':') || 'form:consultar'

    formBody.set(cnpjField, cleanCnpj)
    formBody.set(captchaField, captchaAnswer)
    formBody.set(submitBtn, submitBtn)

    const submitRes = await fetch(FGTS_URL, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieStr,
        Referer: FGTS_URL,
      },
      body: formBody.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })

    const resultHtml = await submitRes.text()

    // Parse FGTS result
    if (resultHtml.includes('Regular') || resultHtml.includes('CRF') || resultHtml.includes('Certificado de Regularidade')) {
      const numMatch = resultHtml.match(/(?:CRF|Certificado)[^0-9]*(\d[\d./-]+)/i)
      const valMatch = resultHtml.match(/Válid[oa]\s+até[:\s]*(\d{2}\/\d{2}\/\d{4})/i)

      let validade: string | null = null
      if (valMatch?.[1]) {
        const [d, m, y] = valMatch[1].split('/')
        validade = `${y}-${m}-${d}`
      }

      return {
        tipo: 'fgts',
        label: 'CRF FGTS (Caixa)',
        situacao: 'regular',
        detalhes: 'Certificado de Regularidade do FGTS emitido com sucesso',
        numero: numMatch?.[1] || null,
        emissao: todayISO(),
        validade,
        pdf_url: null,
        consulta_url: FGTS_URL,
      }
    }

    if (resultHtml.includes('Irregular') || resultHtml.includes('restrição')) {
      return {
        tipo: 'fgts',
        label: 'CRF FGTS (Caixa)',
        situacao: 'irregular',
        detalhes: 'Empresa possui restrição junto ao FGTS',
        numero: null,
        emissao: todayISO(),
        validade: null,
        pdf_url: null,
        consulta_url: FGTS_URL,
      }
    }

    throw new Error('Resultado não interpretado')
  } catch (err) {
    console.error('[certidoes-auto] FGTS error:', err)
    return {
      tipo: 'fgts',
      label: 'CRF FGTS (Caixa)',
      situacao: 'error',
      detalhes: `Falha na consulta automática: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
      consulta_url: FGTS_URL,
    }
  }
}

// ─── Main Auto-Consulta ─────────────────────────────────────────────────────

/**
 * Attempt to fetch all certidões automatically.
 * Falls back to manual for each one that fails.
 */
export async function consultarCertidoesAuto(
  cnpj: string,
  options?: { uf?: string; municipio?: string },
): Promise<{
  certidoes: CertidaoResult[]
  errors: string[]
  autoCount: number
}> {
  const errors: string[] = []
  let autoCount = 0

  // Run all fetches in parallel
  const [cndt, cndFederal, fgts] = await Promise.allSettled([
    fetchCNDTAuto(cnpj),
    fetchCNDFederalAuto(cnpj),
    fetchFGTSAuto(cnpj),
  ])

  const certidoes: CertidaoResult[] = []

  // Process CNDT
  if (cndt.status === 'fulfilled') {
    certidoes.push(cndt.value)
    if (cndt.value.situacao !== 'manual' && cndt.value.situacao !== 'error') autoCount++
    if (cndt.value.situacao === 'error') errors.push(`CNDT: ${cndt.value.detalhes}`)
  } else {
    errors.push(`CNDT: ${cndt.reason}`)
  }

  // Process CND Federal
  if (cndFederal.status === 'fulfilled') {
    certidoes.push(cndFederal.value)
    if (cndFederal.value.situacao !== 'manual' && cndFederal.value.situacao !== 'error') autoCount++
    if (cndFederal.value.situacao === 'error') errors.push(`CND Federal: ${cndFederal.value.detalhes}`)
  } else {
    errors.push(`CND Federal: ${cndFederal.reason}`)
  }

  // Process FGTS
  if (fgts.status === 'fulfilled') {
    certidoes.push(fgts.value)
    if (fgts.value.situacao !== 'manual' && fgts.value.situacao !== 'error') autoCount++
    if (fgts.value.situacao === 'error') errors.push(`FGTS: ${fgts.value.detalhes}`)
  } else {
    errors.push(`FGTS: ${fgts.reason}`)
  }

  return { certidoes, errors, autoCount }
}
