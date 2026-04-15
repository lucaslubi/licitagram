/**
 * Portal adapter factory.
 *
 * MVP: only ComprasGov is implemented.
 * TODO(post-mvp): Add BLL, Licitanet, PCP adapters.
 */

import type { PortalAdapter } from './types'
import { NotImplementedError } from './types'
import { ComprasGovAdapter } from './comprasgov'

const adapters: Record<string, () => PortalAdapter> = {
  comprasgov: () => new ComprasGovAdapter(),
  // TODO(post-mvp): BLL adapter
  // bll: () => new BllAdapter(),
  // TODO(post-mvp): Licitanet adapter
  // licitanet: () => new LicitanetAdapter(),
  // TODO(post-mvp): Portal de Compras Públicas adapter
  // pcp: () => new PcpAdapter(),
}

export function getAdapter(portalSlug: string): PortalAdapter {
  const factory = adapters[portalSlug]
  if (!factory) {
    throw new NotImplementedError(portalSlug)
  }
  return factory()
}
