/**
 * Certidões — Automated Government Integration
 *
 * 1. Receita Federal (CND) — hCaptcha solved via 2Captcha → REST API
 * 2. TST (CNDT) — Custom image captcha solved via 2Captcha → JSF AJAX
 * 3. Caixa (FGTS CRF) — WAF-protected → manual fallback
 *
 * Falls back to manual links if automation fails.
 */

import type { CertidaoResult } from './certidoes'

// ─── Config ─────────────────────────────────────────────────────────────────

const TWO_CAPTCHA_KEY = process.env.TWO_CAPTCHA_API_KEY || ''

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isAutoSolveAvailable(): boolean {
  return !!TWO_CAPTCHA_KEY
}

// ─── 2Captcha Helpers ───────────────────────────────────────────────────────

async function solveImageCaptcha(base64Image: string): Promise<string | null> {
  if (!TWO_CAPTCHA_KEY) return null

  try {
    const { Solver } = await import('2captcha-ts')
    const solver = new Solver(TWO_CAPTCHA_KEY)

    const result = await solver.imageCaptcha({
      body: base64Image,
      numeric: 0,
      min_len: 4,
      max_len: 8,
    })

    return result?.data || null
  } catch (err) {
    console.error('[certidoes-auto] 2Captcha image solve error:', err)
    return null
  }
}

async function solveHCaptcha(sitekey: string, pageurl: string): Promise<string | null> {
  if (!TWO_CAPTCHA_KEY) return null

  try {
    const { Solver } = await import('2captcha-ts')
    const solver = new Solver(TWO_CAPTCHA_KEY)

    const result = await solver.hcaptcha({
      sitekey,
      pageurl,
    })

    return result?.data || null
  } catch (err) {
    console.error('[certidoes-auto] 2Captcha hCaptcha solve error:', err)
    return null
  }
}

// ─── Receita Federal (CND) — hCaptcha + REST API ────────────────────────────
// Angular SPA at servicos.receitafederal.gov.br
// Requires hCaptcha token in X-Captcha-Token header
// Sitekey: 4a65992d-58fc-4812-8b87-789f7e7c4c4b

const RECEITA_BASE = 'https://servicos.receitafederal.gov.br/servico/certidoes'
const RECEITA_MANUAL_URL = 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj'
const RECEITA_HCAPTCHA_SITEKEY = '4a65992d-58fc-4812-8b87-789f7e7c4c4b'

export async function fetchCNDFederalAuto(cnpj: string): Promise<CertidaoResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')

  try {
    if (!TWO_CAPTCHA_KEY) {
      return {
        tipo: 'cnd_federal',
        label: 'CND Federal (Receita/PGFN)',
        situacao: 'manual',
        detalhes: 'Chave 2Captcha necessária para resolver hCaptcha da Receita Federal.',
        numero: null, emissao: null, validade: null, pdf_url: null,
        consulta_url: RECEITA_MANUAL_URL,
      }
    }

    console.log('[certidoes-auto] Receita Federal: solving hCaptcha...')

    // Step 1: Solve hCaptcha via 2Captcha
    const captchaToken = await solveHCaptcha(
      RECEITA_HCAPTCHA_SITEKEY,
      `${RECEITA_BASE}/`,
    )

    if (!captchaToken) {
      throw new Error('hCaptcha não resolvido')
    }

    console.log('[certidoes-auto] Receita Federal: hCaptcha solved, calling API...')

    // Step 2: Load page for session cookies
    const pageRes = await fetch(`${RECEITA_BASE}/`, {
      method: 'GET',
      headers: {
        ...HEADERS,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    const pageCookies = pageRes.headers.getSetCookie?.() || []
    const cookieStr = pageCookies.map((c) => c.split(';')[0]).join('; ')

    const apiHeaders: Record<string, string> = {
      ...HEADERS,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://servicos.receitafederal.gov.br',
      Referer: `${RECEITA_BASE}/`,
      'X-Captcha-Token': captchaToken,
      ...(cookieStr ? { Cookie: cookieStr } : {}),
    }

    const body = JSON.stringify({
      ni: cleanCnpj,
      tipoContribuinte: 'PJ',
      tipoContribuinteEnum: 'CNPJ',
    })

    // Step 3: Validate the CNPJ
    const verifyRes = await fetch(`${RECEITA_BASE}/api/consulta/validar-contribuinte`, {
      method: 'POST',
      headers: apiHeaders,
      body,
      signal: AbortSignal.timeout(15_000),
    })

    console.log('[certidoes-auto] Receita verificar status:', verifyRes.status)

    if (!verifyRes.ok) {
      const errText = await verifyRes.text().catch(() => '')
      console.log('[certidoes-auto] Receita verificar error:', errText.substring(0, 300))

      // Try alternative endpoint
      const altRes = await fetch(`${RECEITA_BASE}/api/Emissao/verificar`, {
        method: 'POST',
        headers: apiHeaders,
        body,
        signal: AbortSignal.timeout(15_000),
      })

      if (!altRes.ok) {
        throw new Error(`Receita API HTTP ${verifyRes.status}`)
      }

      const altData = await altRes.json()
      console.log('[certidoes-auto] Receita alt response:', JSON.stringify(altData).substring(0, 300))
    }

    // Step 4: Emit the certidão
    const emitRes = await fetch(`${RECEITA_BASE}/api/Emissao`, {
      method: 'POST',
      headers: apiHeaders,
      body,
      signal: AbortSignal.timeout(20_000),
    })

    if (!emitRes.ok) {
      // Try alternative emit endpoint
      const altEmitRes = await fetch(`${RECEITA_BASE}/api/consulta/emitir`, {
        method: 'POST',
        headers: apiHeaders,
        body,
        signal: AbortSignal.timeout(20_000),
      })

      if (!altEmitRes.ok) {
        const errText = await emitRes.text().catch(() => '')
        throw new Error(`Receita Emissao HTTP ${emitRes.status}: ${errText.substring(0, 200)}`)
      }

      const altData = await altEmitRes.json()
      return parseReceitaJSON(altData)
    }

    const emitData = await emitRes.json()
    console.log('[certidoes-auto] Receita emissao response keys:', Object.keys(emitData))

    return parseReceitaJSON(emitData)
  } catch (err) {
    console.error('[certidoes-auto] Receita Federal error:', err)
    return {
      tipo: 'cnd_federal',
      label: 'CND Federal (Receita/PGFN)',
      situacao: 'manual',
      detalhes: `Consulta automática indisponível: ${err instanceof Error ? err.message : 'erro'}. Acesse o link.`,
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
      consulta_url: RECEITA_MANUAL_URL,
    }
  }
}

function parseReceitaJSON(data: Record<string, unknown>): CertidaoResult {
  const base: Omit<CertidaoResult, 'situacao' | 'detalhes'> = {
    tipo: 'cnd_federal',
    label: 'CND Federal (Receita/PGFN)',
    numero: null,
    emissao: todayISO(),
    validade: null,
    pdf_url: null,
    consulta_url: RECEITA_MANUAL_URL,
  }

  const status = (data.statusEmissao as string) || (data.statusValidacao as string) || ''
  const mensagem = (data.mensagem as Record<string, unknown>) || {}
  const texto = (mensagem.texto as string) || (data.mensagem as string) || ''

  // "Emitida" or similar = certidão emitted successfully
  if (status === 'Emitida' || status === 'CertidaoEmitida') {
    const certidao = (data.certidao as Record<string, unknown>) || {}
    const codigoControle = (certidao.codigoControle as string) || null
    const dataValidade = (certidao.dataValidade as string) || null
    const tipo = (certidao.tipo as string) || ''

    const isNegativa = tipo.toLowerCase().includes('negativa') && !tipo.toLowerCase().includes('positiva')
    const isPositivaComEfeito = tipo.toLowerCase().includes('positiva') && tipo.toLowerCase().includes('efeito')

    let validade: string | null = null
    if (dataValidade) {
      if (dataValidade.includes('/')) {
        const [d, m, y] = dataValidade.split('/')
        validade = `${y}-${m}-${d}`
      } else {
        validade = dataValidade.slice(0, 10)
      }
    }

    return {
      ...base,
      situacao: isNegativa || isPositivaComEfeito ? 'regular' : 'irregular',
      detalhes: isNegativa
        ? 'Certidão Negativa de Débitos emitida pela Receita Federal/PGFN'
        : isPositivaComEfeito
          ? 'Certidão Positiva com Efeitos de Negativa (débitos com exigibilidade suspensa)'
          : 'Certidão Positiva — existem débitos junto à Receita Federal/PGFN',
      numero: codigoControle,
      validade,
    }
  }

  // "SemDireitoCertidao" = has pending issues
  if (status === 'SemDireitoCertidao') {
    return {
      ...base,
      situacao: 'irregular',
      detalhes: typeof texto === 'string' && texto
        ? texto
        : 'Contribuinte possui pendências que impedem a emissão da certidão',
    }
  }

  // "CertidaoValida" = already has a valid certidão
  if (status === 'CertidaoValida' || data.status === 'Emitida') {
    return {
      ...base,
      situacao: 'regular',
      detalhes: 'Certidão válida encontrada na Receita Federal',
    }
  }

  // "ContribuinteValido" = CNPJ is valid, proceed to emit
  if (status === 'ContribuinteValido') {
    return {
      ...base,
      situacao: 'regular',
      detalhes: 'Contribuinte validado pela Receita Federal — certidão pode ser emitida',
    }
  }

  // Unknown response
  if (typeof texto === 'string' && texto) {
    return {
      ...base,
      situacao: 'manual',
      detalhes: texto,
    }
  }

  return {
    ...base,
    situacao: 'manual',
    detalhes: `Resposta: ${status || JSON.stringify(data).substring(0, 150)}`,
  }
}

// ─── TST (CNDT) — Custom Image Captcha via /api endpoint ────────────────────
// Flow:
// 1. GET inicio.faces → session cookies + ViewState
// 2. POST inicio.faces → navigate to gerarCertidao.faces
// 3. GET /api → captcha image bytes + tokenDesafio
// 4. Solve image captcha via 2Captcha
// 5. POST gerarCertidao.faces via A4J AJAX submit

function extractViewState(html: string): string | null {
  const match = html.match(/name="javax\.faces\.ViewState"\s+[^>]*value="([^"]+)"/)
    || html.match(/value="([^"]+)"\s+[^>]*name="javax\.faces\.ViewState"/)
    || html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)
  return match?.[1] || null
}

function extractFormName(html: string): string | null {
  const match = html.match(/<form\s+id="([^"]+)"/)
  return match?.[1] || null
}

function extractButtonName(html: string, buttonValue: string): string | null {
  const escaped = buttonValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`name="([^"]+)"[^>]*value="${escaped}"`))
  return match?.[1] || null
}

function extractContainerId(html: string): string | null {
  // Extract from A4J.AJAX.Submit parameters: 'containerId':'xxx'
  const match = html.match(/'containerId'\s*:\s*'([^']+)'/)
  return match?.[1] || null
}

export async function fetchCNDTAuto(cnpj: string): Promise<CertidaoResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')
  const baseUrl = 'https://cndt-certidao.tst.jus.br'

  try {
    if (!TWO_CAPTCHA_KEY) {
      return {
        tipo: 'trabalhista',
        label: 'CNDT — Certidão Trabalhista (TST)',
        situacao: 'manual',
        detalhes: 'Chave 2Captcha necessária para resolver captcha do TST.',
        numero: null, emissao: null, validade: null, pdf_url: null,
        consulta_url: `${baseUrl}/inicio.faces`,
      }
    }

    // Step 1: GET inicio.faces to get session + ViewState
    console.log('[certidoes-auto] TST: loading inicio.faces...')
    const initRes = await fetch(`${baseUrl}/inicio.faces`, {
      method: 'GET',
      headers: {
        ...HEADERS,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    if (!initRes.ok) throw new Error(`TST inicio.faces HTTP ${initRes.status}`)

    const cookies1 = initRes.headers.getSetCookie?.() || []
    const initHtml = await initRes.text()
    const viewState1 = extractViewState(initHtml)
    const formName = extractFormName(initHtml)
    const btnName = extractButtonName(initHtml, 'Emitir Certidão')

    if (!viewState1) throw new Error('ViewState not found on inicio.faces')
    if (!formName) throw new Error('Form name not found on inicio.faces')
    if (!btnName) throw new Error('Button name not found on inicio.faces')

    console.log(`[certidoes-auto] TST: form=${formName}, btn=${btnName}`)

    // Step 2: POST to inicio.faces clicking "Emitir Certidão"
    const navBody = new URLSearchParams({
      'javax.faces.ViewState': viewState1,
      [formName]: formName,
      [btnName]: 'Emitir Certidão',
    })

    const cookieStr1 = cookies1.map((c) => c.split(';')[0]).join('; ')

    const navRes = await fetch(`${baseUrl}/inicio.faces`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieStr1,
        Referer: `${baseUrl}/inicio.faces`,
        Origin: baseUrl,
      },
      body: navBody.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    // Merge cookies from both responses
    const cookies2 = navRes.headers.getSetCookie?.() || []
    const allCookies = [...cookies1, ...cookies2]
    const cookieStr = [...new Set(allCookies.map((c) => c.split(';')[0]))].join('; ')

    const gerarHtml = await navRes.text()

    if (!gerarHtml.includes('gerarCertidaoForm')) {
      throw new Error('Could not reach gerarCertidao form')
    }

    const viewState2 = extractViewState(gerarHtml)
    if (!viewState2) throw new Error('ViewState not found on gerarCertidao')

    const containerId = extractContainerId(gerarHtml)
    console.log(`[certidoes-auto] TST: on gerarCertidao, containerId=${containerId}`)

    // Step 3: GET /api to get captcha image + tokenDesafio
    console.log('[certidoes-auto] TST: fetching captcha from /api...')
    const captchaRes = await fetch(`${baseUrl}/api`, {
      method: 'GET',
      headers: {
        ...HEADERS,
        Accept: 'application/json',
        Cookie: cookieStr,
        Referer: `${baseUrl}/gerarCertidao.faces`,
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!captchaRes.ok) throw new Error(`TST /api HTTP ${captchaRes.status}`)

    const captchaData = await captchaRes.json() as {
      tokenDesafio: string
      imagem: number[]
      audio?: number[]
      mensagem?: string
    }

    if (!captchaData.imagem || !captchaData.tokenDesafio) {
      throw new Error('Captcha data incomplete from /api')
    }

    // Convert image byte array to base64
    const imageBytes = new Uint8Array(captchaData.imagem)
    const base64Image = Buffer.from(imageBytes).toString('base64')

    console.log(`[certidoes-auto] TST: captcha image ${imageBytes.length} bytes, solving...`)

    // Step 4: Solve captcha with 2Captcha
    const captchaAnswer = await solveImageCaptcha(base64Image)
    if (!captchaAnswer) {
      throw new Error('Captcha não resolvido pelo 2Captcha')
    }

    console.log(`[certidoes-auto] TST: captcha solved: "${captchaAnswer}", submitting...`)

    // Step 5: Submit via A4J AJAX POST
    // RichFaces A4J.AJAX.Submit sends these parameters:
    const submitParams: Record<string, string> = {
      'AJAXREQUEST': containerId || '_viewRoot',
      'javax.faces.ViewState': viewState2,
      'gerarCertidaoForm': 'gerarCertidaoForm',
      'gerarCertidaoForm:cpfCnpj': cleanCnpj,
      'gerarCertidaoForm:podeFazerDownload': 'false',
      'resposta': captchaAnswer.toLowerCase(), // TST uses text-transform: lowercase
      'tokenDesafio': captchaData.tokenDesafio,
      'gerarCertidaoForm:btnEmitirCertidao': 'gerarCertidaoForm:btnEmitirCertidao',
      'emailUsuario': '',
    }

    const submitBody = new URLSearchParams(submitParams)

    const submitRes = await fetch(`${baseUrl}/gerarCertidao.faces`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieStr,
        Referer: `${baseUrl}/gerarCertidao.faces`,
        Origin: baseUrl,
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: submitBody.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    })

    const resultText = await submitRes.text()
    console.log(`[certidoes-auto] TST: submit response ${resultText.length} chars, status ${submitRes.status}`)

    // Parse AJAX response (RichFaces returns partial XML or HTML)
    return parseTSTResponse(resultText, baseUrl)
  } catch (err) {
    console.error('[certidoes-auto] TST error:', err)
    return {
      tipo: 'trabalhista',
      label: 'CNDT — Certidão Trabalhista (TST)',
      situacao: 'manual',
      detalhes: `Consulta automática indisponível: ${err instanceof Error ? err.message : 'erro'}. Acesse o link.`,
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
      consulta_url: 'https://cndt-certidao.tst.jus.br/inicio.faces',
    }
  }
}

function parseTSTResponse(html: string, baseUrl: string): CertidaoResult {
  const base: Omit<CertidaoResult, 'situacao' | 'detalhes'> = {
    tipo: 'trabalhista',
    label: 'CNDT — Certidão Trabalhista (TST)',
    numero: null,
    emissao: todayISO(),
    validade: null,
    pdf_url: null,
    consulta_url: `${baseUrl}/inicio.faces`,
  }

  // Check for success messages
  const hasEmitida = html.includes('EMITIDA com sucesso') || html.includes('Certidão EMITIDA')
  const hasCertidaoNegativa = html.includes('Certidão Negativa') || html.includes('certidão negativa')
  const hasCertidaoPositiva = html.includes('Certidão Positiva') || html.includes('certidão positiva')

  // Check for download link / PDF
  let pdfUrl: string | null = null
  const pdfMatch = html.match(/href="([^"]*(?:\.pdf|download|certidao)[^"]*)"/)
    || html.match(/window\.open\('([^']*(?:\.pdf|download|certidao)[^']*)'\)/)
    || html.match(/fazerDownload[^"]*"([^"]*)"/)
  if (pdfMatch?.[1]) {
    pdfUrl = pdfMatch[1].startsWith('http') ? pdfMatch[1] : `${baseUrl}${pdfMatch[1]}`
  }

  // Extract certidão number
  const numMatch = html.match(/(?:Certidão\s+n[ºo°]|N[úu]mero|Código)[:\s]*(\d[\d./-]+)/i)

  // Extract validity
  let validade: string | null = null
  const valMatch = html.match(/(?:Validade|Válida?\s+até)[:\s]*(\d{2}\/\d{2}\/\d{4})/i)
  if (valMatch?.[1]) {
    const [d, m, y] = valMatch[1].split('/')
    validade = `${y}-${m}-${d}`
  }

  if (hasEmitida || hasCertidaoNegativa) {
    const isNegativa = hasCertidaoNegativa && !hasCertidaoPositiva

    return {
      ...base,
      situacao: isNegativa ? 'regular' : 'irregular',
      detalhes: isNegativa
        ? 'Certidão Negativa de Débitos Trabalhistas emitida com sucesso'
        : 'Certidão Positiva — existem débitos trabalhistas',
      numero: numMatch?.[1]?.trim() || null,
      validade,
      pdf_url: pdfUrl,
    }
  }

  if (hasCertidaoPositiva) {
    return {
      ...base,
      situacao: 'irregular',
      detalhes: 'Certidão Positiva — existem débitos trabalhistas',
      numero: numMatch?.[1]?.trim() || null,
      validade,
      pdf_url: pdfUrl,
    }
  }

  // Check for error messages
  if (html.includes('incorret') || html.includes('inválid') || html.includes('captcha')) {
    return {
      ...base,
      situacao: 'manual',
      detalhes: 'Captcha incorreto ou sessão expirada. Acesse o link.',
      emissao: null,
    }
  }

  // Check for "nada consta" or similar
  if (html.includes('nada consta') || html.includes('Nada Consta')) {
    return {
      ...base,
      situacao: 'regular',
      detalhes: 'Nada consta — Certidão Negativa de Débitos Trabalhistas',
    }
  }

  // If we got a response but couldn't parse it, log and return manual
  console.log('[certidoes-auto] TST: unrecognized response:', html.substring(0, 500))

  return {
    ...base,
    situacao: 'manual',
    detalhes: 'Resposta do TST não reconhecida. Acesse o link.',
    emissao: null,
  }
}

// ─── FGTS (Caixa) — WAF-protected, manual fallback ─────────────────────────

const FGTS_URL = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'

export async function fetchFGTSAuto(_cnpj: string): Promise<CertidaoResult> {
  // Caixa WAF blocks all server-side requests (403)
  // No point trying — go straight to manual
  return {
    tipo: 'fgts',
    label: 'CRF FGTS (Caixa)',
    situacao: 'manual',
    detalhes: 'Consulta automática indisponível (proteção WAF). Acesse o link para emitir manualmente.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: FGTS_URL,
  }
}

// ─── Main Auto-Consulta ─────────────────────────────────────────────────────

export async function consultarCertidoesAuto(
  cnpj: string,
  _options?: { uf?: string; municipio?: string },
): Promise<{
  certidoes: CertidaoResult[]
  errors: string[]
  autoCount: number
}> {
  const errors: string[] = []
  let autoCount = 0

  // Run Receita and TST in parallel (FGTS is instant manual fallback)
  const [cndFederal, cndt, fgts] = await Promise.allSettled([
    fetchCNDFederalAuto(cnpj),
    fetchCNDTAuto(cnpj),
    fetchFGTSAuto(cnpj),
  ])

  const certidoes: CertidaoResult[] = []

  const manualFallback = (tipo: string, label: string, url: string): CertidaoResult => ({
    tipo: tipo as CertidaoResult['tipo'],
    label,
    situacao: 'manual',
    detalhes: 'Consulta automática indisponível. Acesse o link para emitir manualmente.',
    numero: null, emissao: null, validade: null, pdf_url: null,
    consulta_url: url,
  })

  // CND Federal (Receita)
  if (cndFederal.status === 'fulfilled') {
    certidoes.push(cndFederal.value)
    if (cndFederal.value.situacao === 'regular' || cndFederal.value.situacao === 'irregular') autoCount++
  } else {
    errors.push(`CND Federal: ${cndFederal.reason}`)
    certidoes.push(manualFallback('cnd_federal', 'CND Federal (Receita/PGFN)', RECEITA_MANUAL_URL))
  }

  // CNDT (TST)
  if (cndt.status === 'fulfilled') {
    certidoes.push(cndt.value)
    if (cndt.value.situacao === 'regular' || cndt.value.situacao === 'irregular') autoCount++
  } else {
    errors.push(`CNDT: ${cndt.reason}`)
    certidoes.push(manualFallback('trabalhista', 'CNDT — Certidão Trabalhista (TST)', 'https://cndt-certidao.tst.jus.br/inicio.faces'))
  }

  // FGTS (Caixa)
  if (fgts.status === 'fulfilled') {
    certidoes.push(fgts.value)
    if (fgts.value.situacao === 'regular' || fgts.value.situacao === 'irregular') autoCount++
  } else {
    certidoes.push(manualFallback('fgts', 'CRF FGTS (Caixa)', FGTS_URL))
  }

  return { certidoes, errors, autoCount }
}
