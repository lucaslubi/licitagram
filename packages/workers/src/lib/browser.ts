import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser } from 'puppeteer-core'
import { logger } from './logger'
import { getCapSolverExtensionPath } from './capsolver-extension'

puppeteer.use(StealthPlugin())

let browser: Browser | null = null

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--single-process',
]

export async function getBrowser(): Promise<Browser> {
  if (browser) return browser

  const log = logger.child({ module: 'browser' })

  // Load CapSolver extension for automatic captcha solving
  let extensionArgs: string[] = []
  try {
    const extPath = await getCapSolverExtensionPath()
    extensionArgs = [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ]
    log.info({ extPath }, 'CapSolver extension loaded')
  } catch (err) {
    log.warn({ err }, 'CapSolver extension not available, captchas will use API fallback')
  }

  const allArgs = [...LAUNCH_ARGS, ...extensionArgs]

  try {
    // Production: use system Chromium
    // Extensions require headless: 'new' (not headless: true)
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium-browser',
      headless: 'new' as any,
      args: allArgs,
    }) as unknown as Browser
    log.info('Launched system Chromium at /usr/bin/chromium-browser')
  } catch {
    // Dev fallback: use puppeteer bundled Chromium
    browser = await puppeteer.launch({
      headless: 'new' as any,
      args: allArgs,
    }) as unknown as Browser
    log.info('Launched bundled Chromium (dev fallback)')
  }

  browser.on('disconnected', () => {
    log.warn('Browser disconnected, will relaunch on next call')
    browser = null
  })

  return browser
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    const log = logger.child({ module: 'browser' })
    log.info('Closing browser gracefully')
    await browser.close().catch(() => {})
    browser = null
  }
}

process.on('SIGTERM', async () => {
  await closeBrowser()
})

process.on('SIGINT', async () => {
  await closeBrowser()
})
