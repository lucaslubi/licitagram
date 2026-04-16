/**
 * Bot Browser Manager — Playwright context pool for the Licitagram Supreme Bot.
 *
 * Wraps `pregao-chat-monitor/lib/browser-manager` so the bot reuses the same
 * pooling primitives, but keys contexts by `bot_config.id` instead of the
 * pregão-chat credential id. Both eventually share one Chromium process per
 * host — the pool is small (≤ 8 concurrent browsers by design) because each
 * headless Chromium costs ~200 MB RAM.
 *
 * Design:
 *   - getOrCreateContext(configId, storageStateJson?) — storageStateJson comes
 *     from bot_configs.cookies_cipher decrypted by the caller.
 *   - getStorageState(context) — after a fresh login, the runner re-encrypts
 *     and persists the updated storage state so future sessions skip SSO.
 *   - closeContext(configId) — forced teardown on auth failure.
 *   - Idle cleanup every 5 min kills contexts unused > 10 min. The bot's
 *     tick cadence (≥ 6 s) keeps active sessions hot.
 */

import type { BrowserContext } from 'playwright'
import {
  getOrCreateContext as _getOrCreateContext,
  getStorageState as _getStorageState,
  closeContext as _closeContext,
  closeAllContexts as _closeAllContexts,
} from '../../pregao-chat-monitor/lib/browser-manager'

/**
 * Get or create a pooled Playwright BrowserContext for a bot_config id.
 * `storageStateJson` is the JSON string from Playwright's `storageState()` —
 * restore it to skip re-login.
 */
export function getOrCreateContext(
  configId: string,
  storageStateJson?: string,
): Promise<BrowserContext> {
  // Namespace bot contexts so they don't collide with pregao-chat contexts
  // that may use the same credential id. The worker-level pool is a single
  // Map<string, PoolEntry> keyed by the string we pass in.
  return _getOrCreateContext(`bot:${configId}`, storageStateJson)
}

export function getStorageState(context: BrowserContext): Promise<string> {
  return _getStorageState(context)
}

export function closeContext(configId: string): Promise<void> {
  return _closeContext(`bot:${configId}`)
}

export const closeAllContexts = _closeAllContexts
