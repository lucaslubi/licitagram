/**
 * BLL Compras adapter (stub framework — real implementation lands with
 * live portal access).
 *
 * Extends BasePortal so the runner can dispatch to it. Every overridable
 * method throws UnsupportedOperationError with a clear message, mirroring
 * the Phase 0 pattern of failing loud rather than fabricating success.
 *
 * The selectors file is loaded and validated at module load so selector
 * drift surfaces at boot, not on first session.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Page } from 'playwright'
import {
  BasePortal,
  UnsupportedOperationError,
  type BotState,
  type FloorParameters,
  type PortalCredentials,
} from './base-portal'

function loadSelectors(): Record<string, unknown> {
  const candidates = [
    join(__dirname, 'selectors', 'bll.yaml'),
    join(__dirname, '..', '..', '..', 'src', 'bot', 'portals', 'selectors', 'bll.yaml'),
  ]
  for (const candidate of candidates) {
    try {
      return parseYaml(readFileSync(candidate, 'utf8')) as Record<string, unknown>
    } catch {
      continue
    }
  }
  throw new Error(`bot/bll.yaml not found. Tried: ${candidates.join(', ')}`)
}

// Load at module load so we catch YAML parse errors early.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const selectors = loadSelectors()

const MSG =
  'BLL adapter not yet implemented. The selector YAML is in place — the ' +
  'real Playwright flow lands when we have a test fornecedor login for this ' +
  'portal.'

export class BllPortal extends BasePortal {
  async isLoggedIn(): Promise<boolean> {
    return false
  }
  async login(_credentials: PortalCredentials): Promise<void> {
    throw new UnsupportedOperationError(MSG)
  }
  async openPregaoRoom(_pregaoId: string, _url?: string): Promise<Page> {
    throw new UnsupportedOperationError(MSG)
  }
  async getState(): Promise<BotState> {
    throw new UnsupportedOperationError(MSG)
  }
  async setFloor(_params: FloorParameters): Promise<void> {
    throw new UnsupportedOperationError('BLL has no native robô público.')
  }
  async submitLance(_valor: number, _itemId?: string): Promise<boolean> {
    throw new UnsupportedOperationError(MSG)
  }
}
