/**
 * Certidões — Automated Government Integration
 *
 * 1. Receita Federal (CND) — REST API, NO captcha needed!
 * 2. TST (CNDT) — JSF form with image captcha → 2Captcha
 * 3. Caixa (FGTS CRF) — JSF form, WAF-protected → manual fallback
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
  return true // Receita Federal works without captcha now
}

// ─── 2Captcha Helper ────────────────────────────────────────────────────────

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

// ─── Receita Federal (CND) — REST API ────────────────────────────────────────
// New Angular SPA at servicos.receitafederal.gov.br — NO captcha!
// API: POST api/Emissao with {ni, tipoContribuinte: "PJ", tipoContribuinteEnum: "CNPJ"}

const RECEITA_BASE = 'https://servicos.receitafederal.gov.br/servico/certidoes'
const RECEITA_MANUAL_URL = 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj'

export async function fetchCNDFederalAuto(cnpj: string): Promise<CertidaoResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')

  try {
    // Step 0: Load the SPA page to get session cookies
    const pageRes = await fetch(`${RECEITA_BASE}/`, {
      method: 'GET',
      headers: {
        ...HEADERS,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    // Extract session cookies
    const pageCookies = pageRes.headers.getSetCookie?.() || []
    const cookieStr = pageCookies.map((c) => c.split(';')[0]).join('; ')
    console.log('[certidoes-auto] Receita cookies:', cookieStr ? 'present' : 'none')

    const apiHeaders = {
      ...HEADERS,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://servicos.receitafederal.gov.br',
      Referer: `${RECEITA_BASE}/`,
      ...(cookieStr ? { Cookie: cookieStr } : {}),
    }

    const body = JSON.stringify({
      ni: cleanCnpj,
      tipoContribuinte: 'PJ',
      tipoContribuinteEnum: 'CNPJ',
    })

    // Step 1: Verify the CNPJ is valid
    const verifyRes = await fetch(`${RECEITA_BASE}/api/Emissao/verificar`, {
      method: 'POST',
      headers: apiHeaders,
      body,
      signal: AbortSignal.timeout(15_000),
    })

    if (!verifyRes.ok) {
      // Try without cookies — maybe it works
      const retryRes = await fetch(`${RECEITA_BASE}/api/Emissao/verificar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(15_000),
      })
      if (!retryRes.ok) {
        const errText = await retryRes.text().catch(() => '')
        throw new Error(`Receita verificar HTTP ${retryRes.status}: ${errText.substring(0, 200)}`)
      }
      const retryData = await retryRes.json()
      console.log('[certidoes-auto] Receita verificar (retry) response:', JSON.stringify(retryData))
    }

    // Step 2: Emit the certidão
    const emitRes = await fetch(`${RECEITA_BASE}/api/Emissao`, {
      method: 'POST',
      headers: apiHeaders,
      body,
      signal: AbortSignal.timeout(20_000),
    })

    if (!emitRes.ok) {
      const errText = await emitRes.text().catch(() => '')
      throw new Error(`Receita Emissao HTTP ${emitRes.status}: ${errText.substring(0, 200)}`)
    }

    const emitData = await emitRes.json()
    console.log('[certidoes-auto] Receita emissao response:', JSON.stringify(emitData))

    // Parse the JSON response
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

  const status = (data.statusEmissao as string) || ''
  const mensagem = (data.mensagem as Record<string, unknown>) || {}
  const texto = (mensagem.texto as string) || ''

  // "Emitida" or similar = certidão emitted successfully
  if (status === 'Emitida' || status === 'CertidaoEmitida') {
    // Try to get certidão details from response
    const certidao = (data.certidao as Record<string, unknown>) || {}
    const codigoControle = (certidao.codigoControle as string) || null
    const dataValidade = (certidao.dataValidade as string) || null
    const tipo = (certidao.tipo as string) || ''

    const isNegativa = tipo.toLowerCase().includes('negativa') && !tipo.toLowerCase().includes('positiva')
    const isPositivaComEfeito = tipo.toLowerCase().includes('positiva') && tipo.toLowerCase().includes('efeito')

    let validade: string | null = null
    if (dataValidade) {
      // Could be ISO format or dd/MM/yyyy
      if (dataValidade.includes('/')) {
        const [d, m, y] = dataValidade.split('/')
        validade = `${y}-${m}-${d}`
      } else {
        validade = dataValidade.slice(0, 10) // ISO date
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
      detalhes: texto || 'Contribuinte possui pendências que impedem a emissão da certidão',
    }
  }

  // "CertidaoValida" = already has a valid certidão (from verificar)
  if (status === 'CertidaoValida' || data.status === 'Emitida') {
    return {
      ...base,
      situacao: 'regular',
      detalhes: 'Certidão válida encontrada na Receita Federal',
    }
  }

  // Unknown response — try to extract info from texto
  if (texto) {
    return {
      ...base,
      situacao: 'manual',
      detalhes: texto,
    }
  }

  return {
    ...base,
    situacao: 'manual',
    detalhes: `Resposta não reconhecida: ${status || JSON.stringify(data).substring(0, 100)}`,
  }
}

// ─── TST (CNDT) — JSF with Image Captcha ─────────────────────────────────────
// Flow: GET inicio.faces → POST (submit "Emitir Certidão") → gerarCertidao.faces
// The form uses a custom image captcha (NOT reCAPTCHA), solvable with 2Captcha

function extractViewState(html: string): string | null {
  const match = html.match(/name="javax\.faces\.ViewState"\s+value="([^"]+)"/)
    || html.match(/value="([^"]+)"\s+name="javax\.faces\.ViewState"/)
  return match?.[1] || null
}

export async function fetchCNDTAuto(cnpj: string): Promise<CertidaoResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')
  const baseUrl = 'https://cndt-certidao.tst.jus.br'

  try {
    // Step 1: GET inicio.faces to get session + ViewState
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

    const cookies = initRes.headers.getSetCookie?.() || []
    const cookieStr = cookies.map((c) => c.split(';')[0]).join('; ')
    const initHtml = await initRes.text()
    const viewState1 = extractViewState(initHtml)

    if (!viewState1) throw new Error('ViewState not found on inicio.faces')

    // Step 2: POST to inicio.faces clicking "Emitir Certidão"
    // From Chrome inspection: button name is "formulario:btnEmitirCertidao" (submit type)
    const navBody = new URLSearchParams({
      'javax.faces.ViewState': viewState1,
      'formulario': 'formulario',
      'formulario:btnEmitirCertidao': 'Emitir Certidão',
    })

    const navRes = await fetch(`${baseUrl}/inicio.faces`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieStr,
        Referer: `${baseUrl}/inicio.faces`,
        Origin: baseUrl,
      },
      body: navBody.toString(),
      redirect: 'manual', // Don't follow redirect, capture Location
      signal: AbortSignal.timeout(15_000),
    })

    // Get cookies from POST response too
    const navCookies = navRes.headers.getSetCookie?.() || []
    const allCookies = [...cookies, ...navCookies]
    const fullCookieStr = [...new Set(allCookies.map((c) => c.split(';')[0]))].join('; ')

    // Follow redirect or check for form in response
    let formHtml: string

    if (navRes.status >= 300 && navRes.status < 400) {
      const location = navRes.headers.get('location') || `${baseUrl}/gerarCertidao.faces`
      const redirectUrl = location.startsWith('http') ? location : `${baseUrl}${location}`
      const certRes = await fetch(redirectUrl, {
        method: 'GET',
        headers: {
          ...HEADERS,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Cookie: fullCookieStr,
          Referer: `${baseUrl}/inicio.faces`,
        },
        signal: AbortSignal.timeout(15_000),
      })
      formHtml = await certRes.text()
    } else {
      formHtml = await navRes.text()
      // If response doesn't have the form, try GET gerarCertidao.faces
      if (!formHtml.includes('gerarCertidaoForm')) {
        const certRes = await fetch(`${baseUrl}/gerarCertidao.faces`, {
          method: 'GET',
          headers: {
            ...HEADERS,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Cookie: fullCookieStr,
            Referer: `${baseUrl}/inicio.faces`,
          },
          signal: AbortSignal.timeout(15_000),
        })
        formHtml = await certRes.text()
      }
    }

    if (!formHtml.includes('gerarCertidaoForm')) {
      throw new Error('Could not reach gerarCertidao form')
    }

    // Step 3: Extract form data
    const viewState2 = extractViewState(formHtml)
    if (!viewState2) throw new Error('ViewState not found on gerarCertidao')

    // Extract captcha image (base64 embedded)
    const imgMatch = formHtml.match(/id="idImgBase64"[^>]*src="data:image\/[^;]+;base64,\s*([^"]+)"/)
    if (!imgMatch?.[1]) throw new Error('Captcha image not found')
    const captchaBase64 = imgMatch[1].trim()

    // Extract tokenDesafio
    const tokenMatch = formHtml.match(/name="tokenDesafio"[^>]*value="([^"]*)"/)
      || formHtml.match(/id="tokenDesafio"[^>]*value="([^"]*)"/)
    const tokenDesafio = tokenMatch?.[1] || ''

    // Step 4: Solve captcha with 2Captcha
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

    const captchaAnswer = await solveImageCaptcha(captchaBase64)
    if (!captchaAnswer) {
      return {
        tipo: 'trabalhista',
        label: 'CNDT — Certidão Trabalhista (TST)',
        situacao: 'manual',
        detalhes: 'Captcha não resolvido. Acesse o link para emitir manualmente.',
        numero: null, emissao: null, validade: null, pdf_url: null,
        consulta_url: `${baseUrl}/inicio.faces`,
      }
    }

    // Step 5: Submit the form
    const formBody = new URLSearchParams({
      'javax.faces.ViewState': viewState2,
      'gerarCertidaoForm': 'gerarCertidaoForm',
      'gerarCertidaoForm:cpfCnpj': cleanCnpj,
      'gerarCertidaoForm:podeFazerDownload': 'false',
      'resposta': captchaAnswer,
      'tokenDesafio': tokenDesafio,
      'gerarCertidaoForm:btnEmitirCertidao': 'Emitir Certidão',
    })

    const submitRes = await fetch(`${baseUrl}/gerarCertidao.faces`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: fullCookieStr,
        Referer: `${baseUrl}/gerarCertidao.faces`,
        Origin: baseUrl,
      },
      body: formBody.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })

    const resultHtml = await submitRes.text()

    // Parse result
    if (resultHtml.includes('Certidão Negativa') || resultHtml.includes('CNDT')) {
      const numMatch = resultHtml.match(/(?:Certidão\s+n[ºo°]|N[úu]mero)[:\s]*(\d[\d./-]+)/i)
      const valMatch = resultHtml.match(/(?:Validade|Válida?\s+até)[:\s]*(\d{2}\/\d{2}\/\d{4})/i)

      let validade: string | null = null
      if (valMatch?.[1]) {
        const [d, m, y] = valMatch[1].split('/')
        validade = `${y}-${m}-${d}`
      }

      const isNegativa = resultHtml.includes('Certidão Negativa') && !resultHtml.includes('Certidão Positiva')

      // Check for PDF download link
      let pdfUrl: string | null = null
      const pdfMatch = resultHtml.match(/href="([^"]*\.pdf[^"]*)"/)
        || resultHtml.match(/window\.open\('([^']*\.pdf[^']*)'\)/)
      if (pdfMatch?.[1]) {
        pdfUrl = pdfMatch[1].startsWith('http') ? pdfMatch[1] : `${baseUrl}${pdfMatch[1]}`
      }

      return {
        tipo: 'trabalhista',
        label: 'CNDT — Certidão Trabalhista (TST)',
        situacao: isNegativa ? 'regular' : 'irregular',
        detalhes: isNegativa
          ? 'Certidão Negativa de Débitos Trabalhistas emitida com sucesso'
          : 'Certidão Positiva — existem débitos trabalhistas',
        numero: numMatch?.[1]?.trim() || null,
        emissao: todayISO(),
        validade,
        pdf_url: pdfUrl,
        consulta_url: `${baseUrl}/inicio.faces`,
      }
    }

    // Captcha wrong or session expired
    if (resultHtml.includes('incorret') || resultHtml.includes('inválid') || resultHtml.includes('captcha')) {
      throw new Error('Captcha incorreto — sessão expirada')
    }

    throw new Error('Resposta do TST não reconhecida')
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

// ─── FGTS (Caixa) — JSF Form ────────────────────────────────────────────────
// WAF blocks server-side requests (403). Fall back to manual.

const FGTS_URL = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'

export async function fetchFGTSAuto(cnpj: string): Promise<CertidaoResult> {
  const cleanCnpj = cnpj.replace(/\D/g, '')

  try {
    // Step 1: Load page
    const pageRes = await fetch(FGTS_URL, {
      method: 'GET',
      headers: {
        ...HEADERS,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Connection: 'keep-alive',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })

    if (!pageRes.ok) throw new Error(`FGTS page HTTP ${pageRes.status}`)

    const pageHtml = await pageRes.text()
    const cookies = pageRes.headers.getSetCookie?.() || []
    const cookieStr = cookies.map((c) => c.split(';')[0]).join('; ')
    const viewState = extractViewState(pageHtml)
    if (!viewState) throw new Error('ViewState not found on FGTS page')

    // Step 2: Submit form — no captcha
    const formBody = new URLSearchParams({
      'javax.faces.ViewState': viewState,
      'mainForm': 'mainForm',
      'mainForm:inscricao': cleanCnpj,
      'mainForm:tipoInscricao': 'CNPJ',
      'mainForm:uf': '',
      'mainForm:_link_hidden_': '',
      'mainForm:j_idcl': '',
      'mainForm:btnConsultar': 'Consultar',
    })

    const submitRes = await fetch(FGTS_URL, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieStr,
        Referer: FGTS_URL,
        Origin: 'https://consulta-crf.caixa.gov.br',
      },
      body: formBody.toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })

    const resultHtml = await submitRes.text()

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

    throw new Error('Resultado FGTS não interpretado')
  } catch (err) {
    console.error('[certidoes-auto] FGTS error:', err)
    return {
      tipo: 'fgts',
      label: 'CRF FGTS (Caixa)',
      situacao: 'manual',
      detalhes: 'Consulta automática indisponível. Acesse o link para emitir manualmente.',
      numero: null,
      emissao: null,
      validade: null,
      pdf_url: null,
      consulta_url: FGTS_URL,
    }
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

  // Run all fetches in parallel
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

  // CND Federal (Receita) — should work without captcha
  if (cndFederal.status === 'fulfilled') {
    certidoes.push(cndFederal.value)
    if (cndFederal.value.situacao === 'regular' || cndFederal.value.situacao === 'irregular') autoCount++
  } else {
    certidoes.push(manualFallback('cnd_federal', 'CND Federal (Receita/PGFN)', RECEITA_MANUAL_URL))
  }

  // CNDT (TST) — uses 2Captcha
  if (cndt.status === 'fulfilled') {
    certidoes.push(cndt.value)
    if (cndt.value.situacao === 'regular' || cndt.value.situacao === 'irregular') autoCount++
  } else {
    certidoes.push(manualFallback('trabalhista', 'CNDT — Certidão Trabalhista (TST)', 'https://cndt-certidao.tst.jus.br/inicio.faces'))
  }

  // FGTS (Caixa) — may be blocked by WAF
  if (fgts.status === 'fulfilled') {
    certidoes.push(fgts.value)
    if (fgts.value.situacao === 'regular' || fgts.value.situacao === 'irregular') autoCount++
  } else {
    certidoes.push(manualFallback('fgts', 'CRF FGTS (Caixa)', FGTS_URL))
  }

  return { certidoes, errors, autoCount }
}
