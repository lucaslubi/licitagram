/**
 * Playwright browser context pool for pregão chat monitoring.
 *
 * One BrowserContext per credential — shared across polls for the same client.
 * Auto-cleanup of idle contexts after 10 minutes.
 * Uses playwright-extra with stealth plugin to avoid bot detection.
 *
 * SEPARATE from the existing puppeteer-based browser.ts used by the bidding bot.
 */

import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, BrowserContext } from 'playwright'
import { logger } from '../../lib/logger'

// Apply stealth plugin once
chromium.use(StealthPlugin())

// ─── Context Pool ───────────────────────────────────────────────────────────

interface PoolEntry {
  context: BrowserContext
  browser: Browser
  lastUsed: number
}

const contextPool = new Map<string, PoolEntry>()

// ─── Browser Launch Args ────────────────────────────────────────────────────

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-web-security',
  '--disable-features=IsolateOrigins,site-per-process',
]

// ─── Get or Create Context ──────────────────────────────────────────────────

export async function getOrCreateContext(
  credentialId: string,
  storageState?: string, // JSON string of Playwright storageState
): Promise<BrowserContext> {
  const existing = contextPool.get(credentialId)
  if (existing) {
    existing.lastUsed = Date.now()
    // Verify context is still usable
    try {
      const pages = existing.context.pages()
      if (pages !== undefined) {
        return existing.context
      }
    } catch {
      // Context is dead, clean up and recreate
      logger.warn({ credentialId }, 'Stale browser context detected, recreating')
      await cleanupEntry(credentialId, existing)
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: LAUNCH_ARGS,
  })

  const contextOptions: Record<string, unknown> = {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    ignoreHTTPSErrors: true,
  }

  if (storageState) {
    try {
      contextOptions.storageState = JSON.parse(storageState)
    } catch {
      logger.warn({ credentialId }, 'Invalid storageState JSON, starting fresh')
    }
  }

  const context = await browser.newContext(contextOptions)

  // Set default navigation timeout
  context.setDefaultNavigationTimeout(30_000)
  context.setDefaultTimeout(15_000)

  contextPool.set(credentialId, {
    context,
    browser,
    lastUsed: Date.now(),
  })

  logger.info({ credentialId, poolSize: contextPool.size }, 'Browser context created')
  return context
}

// ─── Save Storage State ─────────────────────────────────────────────────────

export async function getStorageState(context: BrowserContext): Promise<string> {
  const state = await context.storageState()
  return JSON.stringify(state)
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

async function cleanupEntry(credentialId: string, entry: PoolEntry): Promise<void> {
  try {
    await entry.context.close()
  } catch { /* ignore */ }
  try {
    await entry.browser.close()
  } catch { /* ignore */ }
  contextPool.delete(credentialId)
}

export async function closeContext(credentialId: string): Promise<void> {
  const entry = contextPool.get(credentialId)
  if (entry) {
    await cleanupEntry(credentialId, entry)
    logger.info({ credentialId, poolSize: contextPool.size }, 'Browser context closed')
  }
}

// ─── Idle Cleanup (every 5 min) ─────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

const cleanupTimer = setInterval(async () => {
  const now = Date.now()
  const toClean: string[] = []

  for (const [id, entry] of contextPool.entries()) {
    if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
      toClean.push(id)
    }
  }

  for (const id of toClean) {
    const entry = contextPool.get(id)
    if (entry) {
      await cleanupEntry(id, entry)
      logger.info({ credentialId: id }, 'Idle browser context cleaned up')
    }
  }

  if (toClean.length > 0) {
    logger.info({ cleaned: toClean.length, remaining: contextPool.size }, 'Browser pool cleanup done')
  }
}, CLEANUP_INTERVAL_MS)

// Don't keep process alive just for cleanup
cleanupTimer.unref()

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

export async function closeAllContexts(): Promise<void> {
  const entries = Array.from(contextPool.entries())
  for (const [id, entry] of entries) {
    await cleanupEntry(id, entry)
  }
  logger.info('All browser contexts closed')
}

// Graceful shutdown on process exit
process.on('SIGTERM', async () => {
  await closeAllContexts()
})

process.on('SIGINT', async () => {
  await closeAllContexts()
})
