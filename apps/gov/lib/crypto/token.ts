import { randomBytes, createHash } from 'node:crypto'

/**
 * Generate a 32-byte secure random token encoded as base64url (43 chars).
 * Used for public campanha form access (/s/[token]). The CLEAR token goes in
 * the email link; only the SHA-256 HASH is stored in the DB (`token_hash`).
 * This way a DB leak never exposes valid tokens.
 */
export function generateSecureToken(): { token: string; hash: string } {
  const bytes = randomBytes(32)
  const token = bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Opaque form for display — shows first 6 chars + ellipsis. */
export function previewToken(token: string): string {
  return `${token.slice(0, 6)}…`
}
