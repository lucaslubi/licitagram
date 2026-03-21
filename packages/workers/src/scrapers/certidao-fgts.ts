import type { CertidaoResult } from './types'
import { getBrowser } from '../lib/browser'
import { logger } from '../lib/logger'
import { solveImageCaptcha } from '../lib/captcha-solver'

const log = logger.child({ module: 'certidao-fgts' })

const FGTS_URL = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'

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

    log.info({ cnpj: cleanCnpj }, 'Navigating to FGTS CRF portal')
    await page.goto(FGTS_URL, { waitUntil: 'networkidle2', timeout: 30000 })

    // Step 1: Wait for JSF form
    await page.waitForSelector('#mainForm\\:inscricao', { timeout: 20000 })

    // Step 2: Type CNPJ (digits only)
    log.info('Typing CNPJ into FGTS form')
    await page.type('#mainForm\\:inscricao', cleanCnpj, { delay: 30 })

    // Step 3: Check for captcha
    const hasCaptcha = await page.evaluate(() => {
      // Look for common captcha patterns on the FGTS page
      const captchaImg = document.querySelector('img[id*="captcha"], img[id*="Captcha"], img.captcha')
      const captchaInput = document.querySelector('input[id*="captcha"], input[id*="Captcha"]')
      return !!(captchaImg || captchaInput)
    })

    if (hasCaptcha) {
      log.info('Captcha detected on FGTS page')

      // Try to extract captcha image
      const captchaBase64 = await page.evaluate(() => {
        const img = document.querySelector(
          'img[id*="captcha"], img[id*="Captcha"], img.captcha',
        ) as HTMLImageElement | null
        if (!img) return null

        // If it's a data: URL
        const src = img.getAttribute('src')
        if (src?.startsWith('data:')) {
          return src.split(',')[1]?.trim() || null
        }

        // Try to read from canvas
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth || img.width
          canvas.height = img.naturalHeight || img.height
          const ctx = canvas.getContext('2d')
          if (!ctx) return null
          ctx.drawImage(img, 0, 0)
          return canvas.toDataURL('image/png').split(',')[1] || null
        } catch {
          return null
        }
      })

      if (captchaBase64) {
        try {
          const answer = await solveImageCaptcha(captchaBase64)
          // Type answer into captcha input
          const captchaInputSel = await page.evaluate(() => {
            const input = document.querySelector(
              'input[id*="captcha"], input[id*="Captcha"]',
            ) as HTMLInputElement | null
            return input?.id ? `#${input.id.replace(/:/g, '\\\\:')}` : null
          })

          if (captchaInputSel) {
            await page.type(captchaInputSel, answer.toLowerCase(), { delay: 30 })
          }
        } catch (err) {
          log.error({ err }, 'FGTS captcha solving failed')
          return manualFallback
        }
      } else {
        log.warn('Captcha detected but image could not be extracted')
        return manualFallback
      }
    }

    // Step 4: Click "Consultar" button
    const consultarSelectors = [
      '#mainForm\\:btnConsultar',
      '#mainForm\\:j_idt.*[value*="Consultar"]',
      'input[value="Consultar"]',
      'button[type="submit"]',
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
        const inputs = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"]'))
        for (const btn of inputs) {
          if (/consultar/i.test((btn as HTMLInputElement).value || btn.textContent || '')) {
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
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 2000))
    } catch {
      // JSF partial update may not trigger full navigation
    }

    // Also wait for any AJAX updates
    await page.waitForFunction(
      () => {
        const body = document.body.innerText
        return /regular|irregular|restri[çc][aã]o|certificado|pendência|n[aã]o\s+consta/i.test(body)
      },
      { timeout: 15000 },
    ).catch(() => {})

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
    const crfMatch = bodyText.match(/CRF\s*(?:n[.ºo]*\s*)?[:.]?\s*([\dA-Z][\d.A-Z/-]+)/i)
    const validadeMatch = bodyText.match(/[Vv][aá]lid[ao]\s*(?:at[eé])?\s*[:.]?\s*(\d{2}[/.]\d{2}[/.]\d{4})/i)
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
