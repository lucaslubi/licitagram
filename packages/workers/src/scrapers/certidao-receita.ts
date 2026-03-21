import type { CertidaoResult } from './types'
import { getBrowser } from '../lib/browser'
import { logger } from '../lib/logger'
import { solveHCaptcha } from '../lib/captcha-solver'

const log = logger.child({ module: 'certidao-receita' })

const RECEITA_URL = 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj'

export async function scrapeReceita(cnpj: string): Promise<CertidaoResult> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  const cleanCnpj = cnpj.replace(/\D/g, '')

  const manualFallback: CertidaoResult = {
    tipo: 'cnd_federal',
    label: 'CND \u2014 Certid\u00e3o de D\u00e9bitos Federais (Receita Federal)',
    situacao: 'manual',
    detalhes: 'N\u00e3o foi poss\u00edvel obter automaticamente. Consulte manualmente.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: RECEITA_URL,
  }

  try {
    page.setDefaultNavigationTimeout(60000)

    log.info({ cnpj: cleanCnpj }, 'Navigating to Receita Federal CND portal')
    await page.goto(RECEITA_URL, { waitUntil: 'networkidle2', timeout: 30000 })

    // Step 1: Wait for the Angular app to bootstrap and render the CNPJ input
    let cnpjInput: string | null = null
    const possibleSelectors = [
      'input[formControlName]',
      'input[formcontrolname]',
      'input[name="cnpj"]',
      'input[placeholder*="CNPJ"]',
      'input[type="text"]',
    ]

    for (const sel of possibleSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 })
        cnpjInput = sel
        break
      } catch {
        continue
      }
    }

    if (!cnpjInput) {
      log.warn('Could not find CNPJ input on Receita Federal page')
      return manualFallback
    }

    // Step 2: Type CNPJ (digits only \u2014 Angular app formats it)
    log.info({ selector: cnpjInput }, 'Typing CNPJ into Receita input')
    await page.type(cnpjInput, cleanCnpj, { delay: 30 })

    // Step 3: Detect hCaptcha
    let hcaptchaFrame: boolean
    try {
      await page.waitForSelector('iframe[src*="hcaptcha"]', { timeout: 8000 })
      hcaptchaFrame = true
    } catch {
      hcaptchaFrame = false
    }

    if (hcaptchaFrame) {
      log.info('hCaptcha detected on Receita Federal page')

      // Extract sitekey from hCaptcha (multiple strategies)
      const sitekey = await page.evaluate(() => {
        // 1. data-sitekey on div
        const div = document.querySelector('[data-sitekey]')
        if (div) return div.getAttribute('data-sitekey')

        // 2. h-captcha div with data-sitekey
        const hcDiv = document.querySelector('.h-captcha[data-sitekey]')
        if (hcDiv) return hcDiv.getAttribute('data-sitekey')

        // 3. iframe src parameter
        const iframe = document.querySelector('iframe[src*="hcaptcha"]') as HTMLIFrameElement | null
        if (iframe?.src) {
          const match = iframe.src.match(/sitekey=([a-f0-9-]+)/i)
          if (match) return match[1]
        }

        // 4. Check hcaptcha render config in window
        const win = window as any
        if (win.hcaptcha?._parms?.sitekey) return win.hcaptcha._parms.sitekey

        // 5. Walk all iframes for hcaptcha ones and extract from src
        const allIframes = document.querySelectorAll('iframe')
        for (const f of allIframes) {
          if (f.src.includes('hcaptcha') || f.src.includes('newassets')) {
            const m = f.src.match(/sitekey=([a-f0-9-]+)/i)
            if (m) return m[1]
          }
        }

        // 6. Check Angular component config or script tags
        const scripts = document.querySelectorAll('script')
        for (const s of scripts) {
          if (s.textContent?.includes('sitekey')) {
            const m = s.textContent.match(/sitekey['":\s]+['"]([a-f0-9-]+)['"]/i)
            if (m) return m[1]
          }
        }

        // 7. Check meta tags
        const meta = document.querySelector('meta[name*="captcha"]')
        if (meta) return meta.getAttribute('content')

        return null
      })

      // If still no sitekey, log the iframe src for debugging
      if (!sitekey) {
        const iframeSrc = await page.evaluate(() => {
          const iframe = document.querySelector('iframe[src*="hcaptcha"]') as HTMLIFrameElement | null
          return iframe?.src || 'no iframe found'
        })
        log.warn({ iframeSrc }, 'hCaptcha detected but sitekey not found - iframe src logged')

      if (!sitekey) {
        log.warn('hCaptcha detected but sitekey not found')
        return manualFallback
      }

      // Try to solve hCaptcha via CapSolver
      let token: string | null = null
      try {
        token = await solveHCaptcha(sitekey, RECEITA_URL)
      } catch (err) {
        log.error({ err }, 'hCaptcha solving threw an error')
        return manualFallback
      }

      if (!token) {
        log.warn('hCaptcha not solved (CapSolver failed)')
        return manualFallback
      }

      // Inject hCaptcha token
      log.info('Injecting hCaptcha token')
      await page.evaluate((t: string) => {
        // Set the hidden response textarea
        const textarea = document.querySelector('[name="h-captcha-response"]') as HTMLTextAreaElement | null
        if (textarea) textarea.value = t

        // Also try the iframe-based hidden input
        const resp = document.querySelector('[name="g-recaptcha-response"]') as HTMLTextAreaElement | null
        if (resp) resp.value = t

        // Trigger the hCaptcha callback if available
        const win = window as unknown as Record<string, unknown>
        if (typeof win.hcaptchaCallback === 'function') {
          ;(win.hcaptchaCallback as (token: string) => void)(t)
        }
        if (typeof win.onHCaptchaSuccess === 'function') {
          ;(win.onHCaptchaSuccess as (token: string) => void)(t)
        }
      }, token)
    }

    // Step 4: Click submit
    const submitSelectors = [
      'button[type="submit"]',
      'button.btn-primary',
      'input[type="submit"]',
      'button[mat-raised-button]',
    ]

    let submitted = false
    for (const sel of submitSelectors) {
      try {
        const btn = await page.$(sel)
        if (btn) {
          await btn.click()
          submitted = true
          break
        }
      } catch {
        continue
      }
    }

    if (!submitted) {
      log.warn('Could not find submit button on Receita page')
      return manualFallback
    }

    // Step 5: Wait for result page
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
      // Also wait a bit for SPA route changes
      await new Promise((r) => setTimeout(r, 3000))
    } catch {
      // SPA may not trigger navigation event
    }

    // Step 6: Parse result
    const bodyText = await page.evaluate(() => document.body.innerText)

    if (/negativa/i.test(bodyText) && !/positiva/i.test(bodyText)) {
      const validadeMatch = bodyText.match(/[Vv][aá]lid[ao]\s*(?:at[eé])?\s*[:.]?\s*(\d{2}[/.]\d{2}[/.]\d{4})/i)
      const numeroMatch = bodyText.match(/Certid[aã]o\s*(?:n[.ºo]*\s*)?[:.]?\s*([\dA-Z][\d.A-Z/-]+)/i)
      const today = new Date().toISOString().split('T')[0]

      return {
        tipo: 'cnd_federal',
        label: 'CND \u2014 Certid\u00e3o de D\u00e9bitos Federais (Receita Federal)',
        situacao: 'regular',
        detalhes: 'Certid\u00e3o Negativa de D\u00e9bitos emitida',
        numero: numeroMatch?.[1] || null,
        emissao: today,
        validade: validadeMatch?.[1] || null,
        pdf_url: null,
        consulta_url: RECEITA_URL,
      }
    }

    if (/positiva/i.test(bodyText)) {
      return {
        tipo: 'cnd_federal',
        label: 'CND \u2014 Certid\u00e3o de D\u00e9bitos Federais (Receita Federal)',
        situacao: 'irregular',
        detalhes: 'Certid\u00e3o Positiva \u2014 existem pend\u00eancias',
        numero: null,
        emissao: null,
        validade: null,
        pdf_url: null,
        consulta_url: RECEITA_URL,
      }
    }

    log.warn('Could not parse Receita Federal result')
    return manualFallback
  } catch (err) {
    log.error({ err, cnpj: cleanCnpj }, 'Unexpected error scraping Receita Federal')
    return manualFallback
  } finally {
    await page.close().catch(() => {})
  }
}
