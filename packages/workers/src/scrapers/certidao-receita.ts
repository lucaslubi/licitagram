import type { CertidaoResult } from './types'
import { getBrowser } from '../lib/browser'
import { logger } from '../lib/logger'

const log = logger.child({ module: 'certidao-receita' })

const RECEITA_URL = 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj'

/** Maximum time to wait for CapSolver extension to auto-solve the captcha */
const CAPTCHA_TIMEOUT = 120_000

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

    // Step 2: Type CNPJ (digits only -- Angular app formats it)
    log.info({ selector: cnpjInput }, 'Typing CNPJ into Receita input')
    await page.type(cnpjInput, cleanCnpj, { delay: 30 })

    // Step 3: Wait for hCaptcha to appear and be auto-solved by CapSolver extension
    let hcaptchaPresent = false
    try {
      await page.waitForSelector('iframe[src*="hcaptcha"]', { timeout: 8000 })
      hcaptchaPresent = true
    } catch {
      hcaptchaPresent = false
    }

    if (hcaptchaPresent) {
      log.info('hCaptcha detected -- waiting for CapSolver extension to auto-solve')

      // Wait for the CapSolver extension to fill the h-captcha-response textarea
      try {
        await page.waitForFunction(
          () => {
            const textarea = document.querySelector(
              'textarea[name="h-captcha-response"]',
            ) as HTMLTextAreaElement | null
            return textarea && textarea.value.length > 0
          },
          { timeout: CAPTCHA_TIMEOUT, polling: 2000 },
        )
        log.info('hCaptcha auto-solved by CapSolver extension')
      } catch {
        log.warn('CapSolver extension did not solve hCaptcha within timeout')
        return manualFallback
      }
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
      const validadeMatch = bodyText.match(
        /[Vv][a\u00e1]lid[ao]\s*(?:at[e\u00e9])?\s*[:.]?\s*(\d{2}[/.]\d{2}[/.]\d{4})/i,
      )
      const numeroMatch = bodyText.match(
        /Certid[a\u00e3]o\s*(?:n[.\u00bao]*\s*)?[:.]?\s*([\dA-Z][\d.A-Z/-]+)/i,
      )
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
