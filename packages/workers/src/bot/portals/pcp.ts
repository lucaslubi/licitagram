/**
 * Portal de Compras Públicas (PCP) adapter.
 *
 * PCP has a documented webservice — when the API client is implemented
 * we'll route writes through it and fall back to Playwright for UI-only
 * actions. For now this is a stub framework that boots its YAML and
 * fails loudly on every method.
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
    join(__dirname, 'selectors', 'pcp.yaml'),
    join(__dirname, '..', '..', '..', 'src', 'bot', 'portals', 'selectors', 'pcp.yaml'),
  ]
  for (const candidate of candidates) {
    try {
      return parseYaml(readFileSync(candidate, 'utf8')) as Record<string, unknown>
    } catch {
      continue
    }
  }
  throw new Error(`bot/pcp.yaml not found. Tried: ${candidates.join(', ')}`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const selectors = loadSelectors()

const MSG =
  'PCP adapter not yet implemented. Phase 3 only ships the structure; ' +
  'real Playwright + optional webservice integration lands with live ' +
  'test credentials.'

export class PcpPortal extends BasePortal {
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
    throw new UnsupportedOperationError('PCP has no native robô público.')
  }
  async submitLance(_valor: number, _itemId?: string): Promise<boolean> {
    throw new UnsupportedOperationError(MSG)
  }
}
