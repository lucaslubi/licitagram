import * as http from 'http'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { logger } from '../lib/logger'
import type { Browser, Page } from 'puppeteer-core'

// @ts-ignore
puppeteer.use(StealthPlugin())

const activeSessions = new Map<string, { browser: Browser, page: Page }>()

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

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    activeSessions.set(sessionId, { browser, page })

    const startUrls: Record<string, string> = {
      'comprasnet': 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras',
      'comprasgov': 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras',
      'pncp': 'https://pncp.gov.br/app/login',
    }

    const startUrl = startUrls[portal] || startUrls['comprasgov']
    
    await page.goto(startUrl, { waitUntil: 'networkidle2' })
    
    // Some portals require clicking "Entrar com gov.br"
    await new Promise(r => setTimeout(r, 2000))
    const loginButton = await page.$('button:has-text("Entrar"), a:has-text("gov.br"), button:has-text("gov.br")')
    if (loginButton) {
      await loginButton.click()
      await new Promise(r => setTimeout(r, 2000))
    }

    const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
    return { url: page.url(), screenshot }
  }

  private async handleAction(sessionId: string, action: string, selector?: string, value?: string) {
    const session = activeSessions.get(sessionId)
    if (!session) throw new Error('Session not active')
    const { page } = session

    if (action === 'type' && selector && value) {
      await page.waitForSelector(selector, { timeout: 5000 })
      await page.focus(selector)
      // clear input
      await page.evaluate((sel) => {
        const input = document.querySelector(sel) as HTMLInputElement
        if (input) input.value = ''
      }, selector)
      await page.type(selector, value, { delay: 30 })
    } else if (action === 'click' && selector) {
      await page.waitForSelector(selector, { timeout: 5000 })
      await page.click(selector)
      await new Promise(r => setTimeout(r, 2000))
    }

    const screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })
    return { url: page.url(), screenshot }
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
    // Gov.BR SSO sets cookies on both sso.acesso.gov.br and the target domain.
    // If we have mostly target domain cookies, we are logged in.
    const url = session.page.url()
    const logged_in = url.includes('gov.br') && !url.includes('sso.acesso.gov.br') && !url.includes('login')
    
    return { logged_in, cookies }
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
