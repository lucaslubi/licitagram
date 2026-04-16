/**
 * Licitações-e (Banco do Brasil) adapter.
 *
 * Historically the most hostile-to-bots portal in Brazil (active anti-bot
 * mechanisms, rate-limit 429s, challenge prompts). Adapter structure is
 * here; real implementation requires careful stealth + A1 certificate
 * support + manual first-login via guided flow.
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
    join(__dirname, 'selectors', 'licitacoes_e.yaml'),
    join(__dirname, '..', '..', '..', 'src', 'bot', 'portals', 'selectors', 'licitacoes_e.yaml'),
  ]
  for (const candidate of candidates) {
    try {
      return parseYaml(readFileSync(candidate, 'utf8')) as Record<string, unknown>
    } catch {
      continue
    }
  }
  throw new Error(`bot/licitacoes_e.yaml not found. Tried: ${candidates.join(', ')}`)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const selectors = loadSelectors()

const MSG =
  'Licitações-e adapter not yet implemented. BB portal requires careful ' +
  'anti-bot stealth + A1 certificate handling; ships with live test access.'

export class LicitacoesEPortal extends BasePortal {
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
    throw new UnsupportedOperationError('Licitações-e has no native robô público.')
  }
  async submitLance(_valor: number, _itemId?: string): Promise<boolean> {
    throw new UnsupportedOperationError(MSG)
  }
}
