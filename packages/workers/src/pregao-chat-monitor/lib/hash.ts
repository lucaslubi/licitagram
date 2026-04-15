/**
 * Message deduplication via SHA-256 hash.
 *
 * Hash = sha256(pregaoId + remetente + dataHoraPortal.toISOString() + conteudo)
 * Stored in pregao_mensagens.hash_mensagem with UNIQUE constraint.
 */

import { createHash } from 'node:crypto'
import type { RawMessage } from '../adapters/types'

export function hashMessage(pregaoId: string, msg: RawMessage): string {
  const input = [
    pregaoId,
    msg.remetente,
    msg.dataHoraPortal.toISOString(),
    msg.conteudo,
  ].join('|')

  return createHash('sha256').update(input, 'utf8').digest('hex')
}
