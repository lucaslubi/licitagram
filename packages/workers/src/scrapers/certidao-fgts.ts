import type { CertidaoResult } from './types'
import { getBrowser } from '../lib/browser'
import { logger } from '../lib/logger'

const log = logger.child({ module: 'certidao-fgts' })

const FGTS_URL = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'

/** Maximum time to wait for CapSolver extension to auto-solve any captcha */
const CAPTCHA_TIMEOUT = 120_000

export async function scrapeFGTS(cnpj: string): Promise<CertidaoResult> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  const cleanCnpj = cnpj.replace(/\D/g, '')

  const manualFallback: CertidaoResult = {
    tipo: 'fgts',
    label: 'CRF \u2014 Certificado de Regularidade do FGTS (Caixa)',
    situacao: 'manual',
    detalhes: 'N\u00e3o foi poss\u00edvel obter automaticamente. Consulte manualmente.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: FGTS_URL,
  }

  try {
    page.setDefaultNavigationTimeout(60000)

    // Set a realistic user-agent for better stealth
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    )

    log.info({ cnpj: cleanCnpj }, 'Navigating to FGTS CRF portal')
    await page.goto(FGTS_URL, { waitUntil: 'networkidle2', timeout: 30000 })

    // Step 1: Wait for JSF form with multiple selector attempts
    const cnpjInputSelectors = [
      '#mainForm\\:inscricao',
      'input[id*="inscricao"]',
      'input[name*="inscricao"]',
      'input[id*="cnpj"]',
      'input[name*="cnpj"]',
      'input[type="text"]',
    ]

    let cnpjInputSel: string | null = null
    for (const sel of cnpjInputSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 })
        cnpjInputSel = sel
        break
      } catch {
        continue
      }
    }

    if (!cnpjInputSel) {
      log.warn('Could not find CNPJ input on FGTS page after trying all selectors')
      return manualFallback
    }

    // Step 2: Type CNPJ (digits only)
    log.info({ selector: cnpjInputSel }, 'Typing CNPJ into FGTS form')
    await page.type(cnpjInputSel, cleanCnpj, { delay: 30 })

    // Step 3: Check for any captcha and let CapSolver extension handle it
    const hasCaptcha = await page.evaluate(() => {
      const captchaImg = document.querySelector(
        'img[id*="captcha"], img[id*="Captcha"], img.captcha',
      )
      const captchaInput = document.querySelector(
        'input[id*="captcha"], input[id*="Captcha"]',
      )
      const hcaptcha = document.querySelector('iframe[src*="hcaptcha"]')
      const recaptcha = document.querySelector('iframe[src*="recaptcha"]')
      const turnstile = document.querySelector('iframe[src*="turnstile"]')
      return !!(captchaImg || captchaInput || hcaptcha || recaptcha || turnstile)
    })

    if (hasCaptcha) {
      log.info('Captcha detected on FGTS page -- waiting for CapSolver extension to auto-solve')

      // Wait for any captcha response to be filled by the extension
      try {
        await page.waitForFunction(
          () => {
            // Check hCaptcha response
            const hResp = document.querySelector(
              'textarea[name="h-captcha-response"]',
            ) as HTMLTextAreaElement | null
            if (hResp && hResp.value.length > 0) return true

            // Check reCAPTCHA response
            const gResp = document.querySelector(
              'textarea[name="g-recaptcha-response"]',
            ) as HTMLTextAreaElement | null
            if (gResp && gResp.value.length > 0) return true

            // Check if captcha input was auto-filled (image captcha)
            const captchaInput = document.querySelector(
              'input[id*="captcha"], input[id*="Captcha"]',
            ) as HTMLInputElement | null
            if (captchaInput && captchaInput.value.length > 0) return true

            // Check Turnstile
            const tResp = document.querySelector(
              'input[name="cf-turnstile-response"]',
            ) as HTMLInputElement | null
            if (tResp && tResp.value.length > 0) return true

            return false
          },
          { timeout: CAPTCHA_TIMEOUT, polling: 2000 },
        )
        log.info('Captcha auto-solved by CapSolver extension')
      } catch {
        log.warn('CapSolver extension did not solve captcha within timeout')
        return manualFallback
      }
    }

    // Step 4: Click "Consultar" button
    const consultarSelectors = [
      '#mainForm\\:btnConsultar',
      'input[value="Consultar"]',
      'button[type="submit"]',
      'input[type="submit"]',
    ]

    let clicked = false
    for (const sel of consultarSelectors) {
      try {
        const el = await page.$(sel)
        if (el) {
          await el.click()
          clicked = true
          break
        }
      } catch {
        continue
      }
    }

    // Fallback: try clicking any submit-like element
    if (!clicked) {
      clicked = await page.evaluate(() => {
        const inputs = Array.from(
          document.querySelectorAll('input[type="submit"], button[type="submit"]'),
        )
        for (const btn of inputs) {
          if (
            /consultar/i.test(
              (btn as HTMLInputElement).value || btn.textContent || '',
            )
          ) {
            ;(btn as HTMLElement).click()
            return true
          }
        }
        return false
      })
    }

    if (!clicked) {
      log.warn('Could not find Consultar button on FGTS page')
      return manualFallback
    }

    // Step 5: Wait for result
    try {
      await page
        .waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
        .catch(() => {})
      await new Promise((r) => setTimeout(r, 2000))
    } catch {
      // JSF partial update may not trigger full navigation
    }

    // Also wait for any AJAX updates
    await page
      .waitForFunction(
        () => {
          const body = document.body.innerText
          return /regular|irregular|restri[çc][aã]o|certificado|pendência|n[aã]o\s+consta/i.test(
            body,
          )
        },
        { timeout: 15000 },
      )
      .catch(() => {})

    // Step 6: Parse result
    const bodyText = await page.evaluate(() => document.body.innerText)

    const isRegular =
      /certificado\s+de\s+regularidade/i.test(bodyText) ||
      (/regular/i.test(bodyText) && !/irregular/i.test(bodyText))

    const isIrregular =
      /irregular/i.test(bodyText) ||
      /restri[çc][ãa]o/i.test(bodyText) ||
      /pend[êe]ncia/i.test(bodyText)

    // Extract CRF number and validade
    const crfMatch = bodyText.match(
      /CRF\s*(?:n[.\u00bao]*\s*)?[:.]?\s*([\dA-Z][\d.A-Z/-]+)/i,
    )
    const validadeMatch = bodyText.match(
      /[Vv][a\u00e1]lid[ao]\s*(?:at[e\u00e9])?\s*[:.]?\s*(\d{2}[/.]\d{2}[/.]\d{4})/i,
    )
    const today = new Date().toISOString().split('T')[0]

    if (isRegular && !isIrregular) {
      return {
        tipo: 'fgts',
        label: 'CRF \u2014 Certificado de Regularidade do FGTS (Caixa)',
        situacao: 'regular',
        detalhes: 'Certificado de Regularidade do FGTS emitido',
        numero: crfMatch?.[1] || null,
        emissao: today,
        validade: validadeMatch?.[1] || null,
        pdf_url: null,
        consulta_url: FGTS_URL,
      }
    }

    if (isIrregular) {
      return {
        tipo: 'fgts',
        label: 'CRF \u2014 Certificado de Regularidade do FGTS (Caixa)',
        situacao: 'irregular',
        detalhes: 'Existem restri\u00e7\u00f5es ou pend\u00eancias no FGTS',
        numero: null,
        emissao: null,
        validade: null,
        pdf_url: null,
        consulta_url: FGTS_URL,
      }
    }

    log.warn('Could not determine FGTS result from page text')
    return manualFallback
  } catch (err) {
    log.error({ err, cnpj: cleanCnpj }, 'Unexpected error scraping FGTS')
    return manualFallback
  } finally {
    await page.close().catch(() => {})
  }
}
