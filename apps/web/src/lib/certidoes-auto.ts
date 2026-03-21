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

// ─── Receita Federal (CND) — Manual only ────────────────────────────────────
// Requires hCaptcha (sitekey: 4a65992d-58fc-4812-8b87-789f7e7c4c4b)
// 2Captcha account doesn't support hCaptcha method → manual fallback

const RECEITA_MANUAL_URL = 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj'

export async function fetchCNDFederalAuto(_cnpj: string): Promise<CertidaoResult> {
  // Receita Federal requires hCaptcha (sitekey: 4a65992d-58fc-4812-8b87-789f7e7c4c4b)
  // hCaptcha solving requires a specific 2Captcha plan that supports it.
  // Without hCaptcha support, we fall back to manual link.
  // The API returns HTTP 400 with "CaptchaTokenNaoInformado" without a valid token.
  return {
    tipo: 'cnd_federal',
    label: 'CND Federal (Receita/PGFN)',
    situacao: 'manual',
    detalhes: 'Site da Receita exige hCaptcha. Acesse o link para emitir manualmente.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: RECEITA_MANUAL_URL,
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

function formatCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}

export async function fetchCNDTAuto(cnpj: string): Promise<CertidaoResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')
  const formattedCnpj = formatCnpj(cleanCnpj)
  const baseUrl = 'https://cndt-certidao.tst.jus.br'
  const MAX_ATTEMPTS = 2 // Retry once if captcha is wrong (~90% accuracy → ~99% with retry)

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

    // Step 2: POST to inicio.faces → navigate to gerarCertidao
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
      body: new URLSearchParams({
        'javax.faces.ViewState': viewState1,
        [formName]: formName,
        [btnName]: 'Emitir Certidão',
      }).toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    const cookies2 = navRes.headers.getSetCookie?.() || []
    const allCookies = [...cookies1, ...cookies2]
    const cookieStr = [...new Set(allCookies.map((c) => c.split(';')[0]))].join('; ')
    const gerarHtml = await navRes.text()

    if (!gerarHtml.includes('gerarCertidaoForm')) {
      throw new Error('Could not reach gerarCertidao form')
    }

    let viewState2 = extractViewState(gerarHtml)
    if (!viewState2) throw new Error('ViewState not found on gerarCertidao')
    const containerId = extractContainerId(gerarHtml)

    // Steps 3-5: Captcha solve + submit loop (retry on failure)
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[certidoes-auto] TST: attempt ${attempt}/${MAX_ATTEMPTS}`)

      // Step 3: GET /api for captcha
      const captchaRes = await fetch(`${baseUrl}/api`, {
        method: 'GET',
        headers: { ...HEADERS, Accept: 'application/json', Cookie: cookieStr },
        signal: AbortSignal.timeout(15_000),
      })
      if (!captchaRes.ok) throw new Error(`TST /api HTTP ${captchaRes.status}`)

      const captchaData = await captchaRes.json() as {
        tokenDesafio: string; imagem: number[]; audio?: number[]
      }
      if (!captchaData.imagem || !captchaData.tokenDesafio) {
        throw new Error('Captcha data incomplete')
      }

      const base64Image = Buffer.from(new Uint8Array(captchaData.imagem)).toString('base64')
      console.log(`[certidoes-auto] TST: captcha ${captchaData.imagem.length} bytes, solving...`)

      // Step 4: Solve with 2Captcha
      const captchaAnswer = await solveImageCaptcha(base64Image)
      if (!captchaAnswer) {
        console.log('[certidoes-auto] TST: 2Captcha failed to solve')
        if (attempt < MAX_ATTEMPTS) continue
        throw new Error('Captcha não resolvido pelo 2Captcha')
      }

      console.log(`[certidoes-auto] TST: solved="${captchaAnswer}", submitting...`)

      // Step 5: A4J AJAX submit
      const ajaxBody = new URLSearchParams({
        'AJAXREQUEST': containerId || '_viewRoot',
        'javax.faces.ViewState': viewState2,
        'gerarCertidaoForm': 'gerarCertidaoForm',
        'gerarCertidaoForm:cpfCnpj': formattedCnpj,
        'gerarCertidaoForm:podeFazerDownload': 'false',
        'resposta': captchaAnswer.toLowerCase(),
        'tokenDesafio': captchaData.tokenDesafio,
        'gerarCertidaoForm:btnEmitirCertidao': 'gerarCertidaoForm:btnEmitirCertidao',
        'emailUsuario': '',
      })

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
        body: ajaxBody.toString(),
        signal: AbortSignal.timeout(25_000),
      })

      const resultText = await submitRes.text()
      console.log(`[certidoes-auto] TST: response ${resultText.length} chars`)
      console.log(`[certidoes-auto] TST: preview:`, resultText.substring(0, 300))

      // NullPointerException = captcha wrong (TST server bug)
      if (resultText.includes('NullPointerException') || resultText.includes('<error>')) {
        console.log(`[certidoes-auto] TST: captcha rejected (attempt ${attempt})`)

        if (attempt < MAX_ATTEMPTS) {
          // Need fresh ViewState for retry — reload gerarCertidao page
          const reloadRes = await fetch(`${baseUrl}/gerarCertidao.faces`, {
            method: 'GET',
            headers: { ...HEADERS, Cookie: cookieStr, Accept: 'text/html' },
            signal: AbortSignal.timeout(15_000),
          })
          const reloadHtml = await reloadRes.text()
          const newVS = extractViewState(reloadHtml)
          if (newVS) viewState2 = newVS
          continue
        }

        return {
          tipo: 'trabalhista',
          label: 'CNDT — Certidão Trabalhista (TST)',
          situacao: 'manual',
          detalhes: `Captcha não aceito após ${MAX_ATTEMPTS} tentativas. Acesse o link.`,
          numero: null, emissao: null, validade: null, pdf_url: null,
          consulta_url: `${baseUrl}/inicio.faces`,
        }
      }

      // Success! Parse the response
      return parseTSTResponse(resultText, baseUrl, cleanCnpj)
    }

    throw new Error('Todas as tentativas de captcha falharam')
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

function parseTSTResponse(responseText: string, baseUrl: string, _cnpj: string): CertidaoResult {
  const base: Omit<CertidaoResult, 'situacao' | 'detalhes'> = {
    tipo: 'trabalhista',
    label: 'CNDT — Certidão Trabalhista (TST)',
    numero: null,
    emissao: todayISO(),
    validade: null,
    pdf_url: null,
    consulta_url: `${baseUrl}/inicio.faces`,
  }

  // A4J AJAX responses are XML with <partial-response>
  const isAjaxXml = responseText.includes('<partial-response')

  if (isAjaxXml) {
    // Check for server errors (wrong captcha causes NullPointerException)
    if (responseText.includes('<error>') || responseText.includes('NullPointerException')) {
      const errorMsg = responseText.match(/<error-name>([^<]*)/)
      console.log('[certidoes-auto] TST: server error:', errorMsg?.[1])
      return {
        ...base,
        situacao: 'manual',
        detalhes: 'Erro no servidor do TST (captcha incorreto ou sessão expirada). Acesse o link.',
        emissao: null,
      }
    }

    // Extract CDATA content from <update> blocks
    const cdataBlocks: string[] = []
    const cdataPattern = /CDATA\[([\s\S]*?)\]\]/g
    let cdataMatch = cdataPattern.exec(responseText)
    while (cdataMatch !== null) {
      cdataBlocks.push(cdataMatch[1])
      cdataMatch = cdataPattern.exec(responseText)
    }

    const allContent = cdataBlocks.join('\n')
    console.log(`[certidoes-auto] TST: AJAX has ${cdataBlocks.length} CDATA blocks, ${allContent.length} chars`)

    if (allContent.length > 0) {
      return parseTSTContent(allContent, base, baseUrl)
    }

    // No CDATA but check for success update IDs
    if (responseText.includes('divSucesso') || responseText.includes('mensagemSucesso')) {
      return {
        ...base,
        situacao: 'regular',
        detalhes: 'Certidão emitida com sucesso pelo TST',
      }
    }

    console.log('[certidoes-auto] TST: AJAX response:', responseText.substring(0, 500))
    return {
      ...base,
      situacao: 'manual',
      detalhes: 'Resposta AJAX do TST sem dados. Acesse o link.',
      emissao: null,
    }
  }

  // Full HTML response
  return parseTSTContent(responseText, base, baseUrl)
}

function parseTSTContent(
  html: string,
  base: Omit<CertidaoResult, 'situacao' | 'detalhes'>,
  baseUrl: string,
): CertidaoResult {
  // Extract certidão number and validity
  const numMatch = html.match(/(?:Certid[ãa]o\s*n[ºo°]|N[úu]mero|C[óo]digo)[:\s]*([A-Z0-9][\d./-]+[A-Z0-9]*)/i)
  const valMatch = html.match(/(?:Validade|V[áa]lida?\s+at[ée]|Vencimento)[:\s]*(\d{2}\/\d{2}\/\d{4})/i)

  let validade: string | null = null
  if (valMatch?.[1]) {
    const parts = valMatch[1].split('/')
    validade = `${parts[2]}-${parts[1]}-${parts[0]}`
  }

  // Check for PDF link
  let pdfUrl: string | null = null
  const pdfMatch = html.match(/href="([^"]*(?:\.pdf|download|certidao)[^"]*)"/)
  if (pdfMatch?.[1]) {
    pdfUrl = pdfMatch[1].startsWith('http') ? pdfMatch[1] : `${baseUrl}${pdfMatch[1]}`
  }

  // In A4J CDATA: "EMITIDA" means the certidão was issued successfully
  if (html.includes('EMITIDA') || html.includes('emitida com sucesso')) {
    const isPositiva = html.includes('Positiva')
    return {
      ...base,
      situacao: isPositiva ? 'irregular' : 'regular',
      detalhes: isPositiva
        ? 'Certidão Positiva — existem débitos trabalhistas'
        : 'Certidão Negativa de Débitos Trabalhistas emitida com sucesso',
      numero: numMatch?.[1]?.trim() || null,
      validade,
      pdf_url: pdfUrl,
    }
  }

  // "Nada consta"
  if (html.includes('nada consta') || html.includes('Nada Consta')) {
    return {
      ...base,
      situacao: 'regular',
      detalhes: 'Nada consta — Certidão Negativa de Débitos Trabalhistas',
    }
  }

  // Captcha incorrect
  if (html.includes('incorret') || html.includes('inv\u00E1lid')) {
    return {
      ...base,
      situacao: 'manual',
      detalhes: 'Captcha incorreto. Acesse o link para emitir manualmente.',
      emissao: null,
    }
  }

  // Generic error
  if (html.includes('Ocorreu um erro') || html.includes('erro na emiss')) {
    return {
      ...base,
      situacao: 'manual',
      detalhes: 'Erro na emissão da certidão pelo TST. Acesse o link.',
      emissao: null,
    }
  }

  console.log('[certidoes-auto] TST: unrecognized content:', html.substring(0, 500))
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
