import * as http from 'http'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { logger } from '../lib/logger'
import { solveHCaptcha } from '../lib/captcha-solver'
import { getCapSolverExtensionPath } from '../lib/capsolver-extension'
import type { Browser, Page } from 'puppeteer-core'

// @ts-ignore
puppeteer.use(StealthPlugin())

const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'

const activeSessions = new Map<string, { browser: Browser, page: Page, portal?: string }>()

const CERTIDAO_URLS: Record<string, string> = {
  receita: 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj',
  fgts: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
}

export class LoginServer {
  start(port: number) {
    const server = http.createServer(async (req, res) => {
      // CORS generic
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
      }

      // Root path health check
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date(), sessions: activeSessions.size }))
        return
      }

      if (req.method === 'POST') {
        let bodyStr = ''
        req.on('data', chunk => { bodyStr += chunk })
        req.on('end', async () => {
          let body: any
          try {
            body = JSON.parse(bodyStr)
          } catch {
            return this.sendJson(res, 400, { error: 'Invalid JSON' })
          }

          try {
            if (req.url === '/start') {
              const { session_id, portal } = body
              if (!session_id || !portal) return this.sendJson(res, 400, { error: 'Missing session_id or portal' })
              
              const result = await this.handleStart(session_id, portal)
              return this.sendJson(res, 200, result)
            } else if (req.url === '/action') {
              const { session_id, action, selector, value } = body
              if (!session_id || !action) return this.sendJson(res, 400, { error: 'Missing session_id or action' })
              
              const result = await this.handleAction(session_id, action, selector, value)
              return this.sendJson(res, 200, result)
            } else if (req.url === '/screenshot') {
              const { session_id } = body
              if (!session_id) return this.sendJson(res, 400, { error: 'Missing session_id' })
              
              const result = await this.handleScreenshot(session_id)
              return this.sendJson(res, 200, result)
            } else if (req.url === '/cookies') {
              const { session_id } = body
              if (!session_id) return this.sendJson(res, 400, { error: 'Missing session_id' })
              
              const result = await this.handleCookies(session_id)
              return this.sendJson(res, 200, result)
            } else if (req.url === '/start_certidao') {
              const { session_id, portal, cnpj } = body
              if (!session_id || !portal || !cnpj) return this.sendJson(res, 400, { error: 'Missing session_id, portal or cnpj' })

              const result = await this.handleStartCertidao(session_id, portal, cnpj)
              return this.sendJson(res, 200, result)
            } else if (req.url === '/check_result') {
              const { session_id } = body
              if (!session_id) return this.sendJson(res, 400, { error: 'Missing session_id' })

              const result = await this.handleCheckResult(session_id)
              return this.sendJson(res, 200, result)
            } else if (req.url === '/solve_captcha') {
              const { session_id } = body
              if (!session_id) return this.sendJson(res, 400, { error: 'Missing session_id' })

              const result = await this.handleSolveCaptcha(session_id)
              return this.sendJson(res, 200, result)
            } else if (req.url === '/close') {
              const { session_id } = body
              if (!session_id) return this.sendJson(res, 400, { error: 'Missing session_id' })

              const result = await this.handleClose(session_id)
              return this.sendJson(res, 200, result)
            } else {
              return this.sendJson(res, 404, { error: 'Not found' })
            }
          } catch (err: any) {
            logger.error({ err: err.message, url: req.url }, 'Login server error')
            return this.sendJson(res, 500, { error: err.message })
          }
        })
        return
      }

      return this.sendJson(res, 404, { error: 'Not found' })
    })

    server.listen(port, () => {
      logger.info({ port }, 'Guided Login Server listening')
    })
  }

  private sendJson(res: http.ServerResponse, status: number, data: any) {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  private async handleStart(sessionId: string, portal: string) {
    if (activeSessions.has(sessionId)) {
      await this.handleClose(sessionId)
    }

    // Load CapSolver extension for automatic captcha solving inside the browser
    let extensionArgs: string[] = []
    try {
      const extPath = await getCapSolverExtensionPath()
      extensionArgs = [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
      ]
      logger.info({ extPath }, 'CapSolver extension loaded for guided login')
    } catch (err) {
      logger.warn({ err }, 'CapSolver extension not available')
    }

    const browser = await puppeteer.launch({
      headless: 'new' as any, // 'new' headless mode required for extensions
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        ...extensionArgs,
      ],
      executablePath: CHROMIUM_PATH,
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    activeSessions.set(sessionId, { browser, page })

    const startUrls: Record<string, string> = {
      'comprasnet': 'https://www.comprasnet.gov.br/seguro/loginPortalFornecedor.asp',
      'comprasgov': 'https://www.comprasnet.gov.br/seguro/loginPortalFornecedor.asp',
      'pncp': 'https://pncp.gov.br/app/login',
    }

    const startUrl = startUrls[portal] || startUrls['comprasgov']
    
    await page.goto(startUrl, { waitUntil: 'networkidle2' })
    
    // Don't auto-click — let the guided login UI handle individual steps
    await new Promise(r => setTimeout(r, 2000))

    const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
    return { url: page.url(), screenshot }
  }

  private async handleAction(sessionId: string, action: string, selector?: string, value?: string) {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error('Session not active')
    const { page } = session

    // Support multiple selectors separated by || (try each until one works)
    const selectors = selector ? selector.split('||').map(s => s.trim()) : []

    if (action === 'type' && selectors.length > 0 && value) {
      const sel = await this.findFirstSelector(page, selectors)
      await page.focus(sel)
      await page.evaluate((s) => {
        const input = document.querySelector(s) as HTMLInputElement
        if (input) input.value = ''
      }, sel)
      await page.type(sel, value, { delay: 30 })
    } else if (action === 'click' && selectors.length > 0) {
      // First try CSS selectors
      let clicked = false
      for (const sel of selectors) {
        try {
          await page.waitForSelector(sel, { timeout: 3000 })
          await page.click(sel)
          clicked = true
          break
        } catch { continue }
      }
      // If no CSS selector worked, try XPath text matching
      if (!clicked && selector) {
        const textMatch = selector.match(/text:(.+)/)
        if (textMatch) {
          const text = textMatch[1].trim()
          const elements = await page.$$(`xpath/.//a[contains(text(), "${text}")] | .//button[contains(text(), "${text}")]`)
          if (elements.length > 0) {
            await elements[0].click()
            clicked = true
          }
        }
      }
      if (!clicked) {
        throw new Error(`No matching element found for selectors: ${selector}`)
      }
      await new Promise(r => setTimeout(r, 2000))
    } else if (action === 'click_xy' && value) {
      // Click at specific coordinates (x,y) — for captcha/interactive elements
      const [x, y] = value.split(',').map(Number)
      if (!isNaN(x) && !isNaN(y)) {
        await page.mouse.click(x, y)
        await new Promise(r => setTimeout(r, 1500))
      }
    }

    const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
    return { url: page.url(), screenshot }
  }

  private async findFirstSelector(page: Page, selectors: string[]): Promise<string> {
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 })
        return sel
      } catch { continue }
    }
    throw new Error(`No matching element found for selectors: ${selectors.join(', ')}`)
  }

  private async handleSolveCaptcha(sessionId: string) {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error('Session not active')
    const { page } = session

    const pageUrl = page.url()
    logger.info({ pageUrl }, 'Attempting to solve captcha')

    // Strategy 1: The CapSolver browser extension auto-solves captchas.
    // We just need to wait for it to complete (up to 60s).
    // The extension detects hCaptcha/reCAPTCHA and solves automatically.
    logger.info('Waiting for CapSolver extension to auto-solve captcha...')

    const startTime = Date.now()
    const maxWait = 60_000 // 60 seconds

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, 3000))

      // Check if captcha is solved by looking for:
      // 1. The captcha error message disappeared
      // 2. hCaptcha response textarea has a value
      // 3. Page navigated away from login
      const status = await page.evaluate(() => {
        const errorEl = document.querySelector('[class*="error"], [class*="alert"]')
        const errorText = errorEl?.textContent?.toLowerCase() || ''
        const hasCaptchaError = errorText.includes('captcha')

        // Check if hCaptcha response has value (means it was solved)
        const hResponse = document.querySelector('[name="h-captcha-response"]') as HTMLTextAreaElement | null
        const gResponse = document.querySelector('[name="g-recaptcha-response"]') as HTMLTextAreaElement | null
        const hasToken = !!(hResponse?.value || gResponse?.value)

        // Check if hCaptcha iframe shows solved state
        const hcFrame = document.querySelector('iframe[src*="hcaptcha"]')
        const isSolvedFrame = hcFrame?.getAttribute('data-hcaptcha-response') || false

        return { hasCaptchaError, hasToken, isSolvedFrame: !!isSolvedFrame, url: window.location.href }
      })

      logger.info({ ...status, elapsed: Date.now() - startTime }, 'Captcha solve check')

      if (status.hasToken || status.isSolvedFrame) {
        logger.info('Captcha solved by extension!')
        const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
        return { solved: true, screenshot, url: page.url() }
      }

      // If page navigated away, captcha was solved and form submitted
      if (!status.url.includes('login') && !status.url.includes('acesso.gov')) {
        logger.info({ newUrl: status.url }, 'Page navigated — captcha+login succeeded')
        const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
        return { solved: true, screenshot, url: page.url() }
      }
    }

    // Strategy 2: Extension didn't solve — try API fallback
    logger.warn('Extension did not solve captcha in time, trying API fallback')

    const sitekey = await page.evaluate(() => {
      const el = document.querySelector('[data-sitekey]') as HTMLElement | null
      if (el) return el.getAttribute('data-sitekey')
      const iframe = document.querySelector('iframe[src*="hcaptcha"]') as HTMLIFrameElement | null
      if (iframe) {
        const m = iframe.src.match(/sitekey=([a-f0-9-]+)/)
        if (m) return m[1]
      }
      return null
    })

    if (sitekey) {
      const token = await solveHCaptcha(sitekey, pageUrl)
      if (token) {
        // Inject token
        await page.evaluate((t: string) => {
          const textarea = document.querySelector('[name="h-captcha-response"]') as HTMLTextAreaElement
          if (textarea) textarea.value = t
          const gTextarea = document.querySelector('[name="g-recaptcha-response"]') as HTMLTextAreaElement
          if (gTextarea) gTextarea.value = t
        }, token)
        logger.info('Captcha solved via API fallback')
        await new Promise(r => setTimeout(r, 1500))
        const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
        return { solved: true, screenshot, url: page.url() }
      }
    }

    const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
    return { solved: false, error: 'Captcha could not be solved. Try refreshing and trying again.', screenshot }
  }

  private async handleScreenshot(sessionId: string) {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error('Session not active')
    
    const screenshot = await session.page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
    return { url: session.page.url(), screenshot }
  }

  private async handleCookies(sessionId: string) {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error('Session not active')

    const cookies = await session.page.cookies()
    const url = session.page.url()

    // Multiple ways to detect successful login:
    // 1. URL is on comprasnet/compras domain (not on SSO login page)
    // 2. Has session cookies from comprasnet or gov.br
    // 3. Not on the login/SSO page anymore
    const isOnLoginPage = url.includes('sso.acesso.gov.br') ||
                          url.includes('loginPortal') ||
                          url.includes('/login')

    const hasSessionCookies = cookies.some((c: { name: string; domain: string }) =>
      (c.domain.includes('comprasnet') || c.domain.includes('compras.gov') || c.domain.includes('gov.br')) &&
      (c.name.includes('session') || c.name.includes('token') || c.name.includes('auth') ||
       c.name.includes('JSESSIONID') || c.name.includes('ASP') || c.name.includes('sid'))
    )

    // Consider logged in if we have session cookies AND are not on the login page
    // OR if we have a good number of cookies from the target domain
    const targetDomainCookies = cookies.filter((c: { domain: string }) =>
      c.domain.includes('comprasnet') || c.domain.includes('compras.gov') || c.domain.includes('estaleiro.serpro')
    )

    const logged_in = (!isOnLoginPage && hasSessionCookies) ||
                      (!isOnLoginPage && targetDomainCookies.length >= 3) ||
                      (!isOnLoginPage && cookies.length >= 5 && !url.includes('acesso.gov'))

    logger.info({
      url,
      cookieCount: cookies.length,
      targetCookies: targetDomainCookies.length,
      hasSessionCookies,
      isOnLoginPage,
      logged_in
    }, 'Login check')

    return { logged_in, cookies }
  }

  private async handleStartCertidao(sessionId: string, portal: string, cnpj: string) {
    // Close existing session if any
    if (activeSessions.has(sessionId)) {
      await this.handleClose(sessionId)
    }

    const url = CERTIDAO_URLS[portal]
    if (!url) throw new Error(`Unknown certidao portal: ${portal}`)

    const clean = cnpj.replace(/\D/g, '')

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: CHROMIUM_PATH,
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    activeSessions.set(sessionId, { browser, page, portal })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    // Wait for SPA to render
    await new Promise(r => setTimeout(r, 5000))

    // Auto-fill CNPJ based on portal
    try {
      if (portal === 'receita') {
        const selectors = ['input[placeholder*="CNPJ"]', 'input[formcontrolname]', 'input[type="text"]']
        let filled = false
        for (const sel of selectors) {
          try {
            await page.waitForSelector(sel, { timeout: 5000 })
            await page.click(sel, { clickCount: 3 }) // select all
            await page.type(sel, clean, { delay: 30 })
            filled = true
            break
          } catch { continue }
        }
        if (!filled) logger.warn('Could not find CNPJ input on Receita page')
      } else if (portal === 'fgts') {
        await page.waitForSelector('input[id*="inscricao"]', { timeout: 10000 })
        await page.click('input[id*="inscricao"]', { clickCount: 3 })
        await page.type('input[id*="inscricao"]', clean, { delay: 30 })
      }
    } catch (err: any) {
      logger.warn({ sessionId, err: err.message }, 'Certidao CNPJ fill failed')
    }

    await new Promise(r => setTimeout(r, 1000))
    const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
    return { screenshot, status: 'captcha_page', url: page.url() }
  }

  private async handleCheckResult(sessionId: string) {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error('Session not found')
    const { page } = session

    const pageText = await page.evaluate(() => document.body?.innerText || '')
    const lower = pageText.toLowerCase()
    const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })

    let result_status = 'pending'
    let detalhes = ''

    if (lower.includes('certidão negativa') || lower.includes('certidao negativa')) {
      result_status = 'negativa'
      detalhes = 'Certidão Negativa emitida com sucesso'
    } else if (lower.includes('certidão positiva com efeitos de negativa')) {
      result_status = 'positiva_negativa'
      detalhes = 'Certidão Positiva com Efeitos de Negativa'
    } else if (lower.includes('certidão positiva') || lower.includes('certidao positiva')) {
      result_status = 'positiva'
      detalhes = 'Certidão Positiva'
    } else if (lower.includes('regularidade fiscal') && lower.includes('regular')) {
      result_status = 'negativa'
      detalhes = 'Situação Regular'
    } else if (lower.includes('crf emitido') || lower.includes('certificado de regularidade')) {
      result_status = 'negativa'
      detalhes = 'CRF FGTS emitido'
    } else if (lower.includes('situação irregular') || lower.includes('situacao irregular')) {
      result_status = 'positiva'
      detalhes = 'Situação Irregular'
    } else if (lower.includes('erro') && (lower.includes('cnpj') || lower.includes('consulta'))) {
      result_status = 'error'
      detalhes = 'Erro na consulta'
    }

    // Try to find PDF download URL
    let pdfUrl: string | null = null
    if (result_status !== 'pending' && result_status !== 'error') {
      try {
        pdfUrl = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href*=".pdf"], a[download]'))
          return links.length > 0 ? (links[0] as HTMLAnchorElement).href : null
        })
      } catch { /* ignore */ }
    }

    return { result_status, detalhes, screenshot, url: page.url(), ...(pdfUrl ? { url: pdfUrl } : {}) }
  }

  private async handleClose(sessionId: string) {
    const session = activeSessions.get(sessionId)
    if (session) {
      await session.browser.close().catch(() => {})
      activeSessions.delete(sessionId)
    }
    return { closed: true }
  }
}
