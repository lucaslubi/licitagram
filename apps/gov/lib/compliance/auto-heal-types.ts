/**
 * Tipos exportados do auto-heal. Separados num arquivo sem 'use server'
 * pra respeitar a regra do Next.js de que arquivos server-action só
 * exportam async functions.
 */
export interface HealAction {
  checkId: string
  checkLabel: string
  action: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'unresolvable'
  detail?: string
  error?: string
}
