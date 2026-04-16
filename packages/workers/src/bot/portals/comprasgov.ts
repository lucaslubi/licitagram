/**
 * ComprasGov (Compras.gov.br) portal adapter — PHASE 0 HONEST STUB.
 *
 * This file used to be a silent-failure trap. The previous implementation:
 *   - `getState()` returned hardcoded nulls, causing the runner's guard
 *     `state.melhor_lance !== null` to always be false → no bid ever sent.
 *   - `submitLance()` returned `true` without doing anything → audit trail
 *     would log bids that never happened → clients could be charged for
 *     phantom lances.
 *   - `navigateToPregao()` returned `true` without navigating.
 *
 * This is a liability. We REMOVE the fake-success code and replace every
 * method with an explicit throw. The runner catches it and marks the
 * session as `failed` with a human-readable reason — the truth.
 *
 * The real Compras.gov.br integration (against the React SPA at
 * cnetmobile.estaleiro.serpro.gov.br/comprasnet-web) lands in Phase 1 as
 * part of the Supreme Bot rollout:
 *   - supervisor mode: set the floor inside the portal's own native
 *     auto-bidder (IN 67/2021) and monitor via pregao-chat-monitor.
 *   - auto-bid mode: submit lances directly via Playwright (opt-in).
 *
 * Until Phase 1 lands, attempting to use this portal fails loud.
 */

import { BasePortal, BotState } from './base-portal'

export class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedOperationError'
  }
}

const NOT_IMPLEMENTED_MESSAGE =
  'Compras.gov.br native bidding is not yet implemented. This portal will ' +
  'ship in Supreme Bot Phase 1. Use the pregão-chat-monitor to monitor the ' +
  'dispute manually in the meantime.'

export class ComprasGovPortal extends BasePortal {
  async login(_cookies: unknown[]): Promise<boolean> {
    throw new UnsupportedOperationError(NOT_IMPLEMENTED_MESSAGE)
  }

  async navigateToPregao(_pregaoId: string): Promise<boolean> {
    throw new UnsupportedOperationError(NOT_IMPLEMENTED_MESSAGE)
  }

  async getState(): Promise<BotState> {
    throw new UnsupportedOperationError(NOT_IMPLEMENTED_MESSAGE)
  }

  async submitLance(_valor: number): Promise<boolean> {
    // NEVER return true here without actually submitting. Phantom lances
    // would poison the audit trail and could trigger client billing.
    throw new UnsupportedOperationError(NOT_IMPLEMENTED_MESSAGE)
  }

  async close(): Promise<void> {
    // no-op — nothing to clean up
  }
}
