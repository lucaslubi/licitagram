/**
 * Portal adapter factory. Maps the `bot_configs.portal` / `bot_sessions.portal`
 * slug to the concrete adapter class.
 *
 * All adapters inherit from BasePortal and follow the same lifecycle:
 *   attach → isLoggedIn → (login if needed) → openPregaoRoom → getState +
 *   (setFloor or submitLance) → close.
 *
 * Phase 1 ships ComprasGov real + MockPortal.
 * Phase 3 adds BLL / PCP / Licitações-e stubs; real implementations land
 * as live test credentials become available.
 */

import { BasePortal, UnsupportedOperationError } from './base-portal'
import { ComprasGovPortal } from './comprasgov'
import { MockPortal } from './mock-portal'
import { BllPortal } from './bll'
import { PcpPortal } from './pcp'
import { LicitacoesEPortal } from './licitacoes_e'

export function getPortalAdapter(slug: string, meta: { portal: string; configId: string }): BasePortal {
  switch (slug) {
    case 'comprasgov':
    case 'comprasnet':
      return new ComprasGovPortal(meta)
    case 'simulator':
    case 'mock':
      return new MockPortal(meta)
    case 'bll':
      return new BllPortal(meta)
    case 'portal_compras':
    case 'pcp':
      return new PcpPortal(meta)
    case 'licitacoes_e':
      return new LicitacoesEPortal(meta)
    default:
      throw new UnsupportedOperationError(`Unknown portal slug: ${slug}`)
  }
}

export { BasePortal, UnsupportedOperationError }
