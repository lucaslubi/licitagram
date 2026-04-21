/**
 * Bot credential encryption — AES-256-GCM via Node.js built-in crypto.
 *
 * Thin re-export layer on top of the battle-tested pregao-chat-monitor crypto
 * module. We use THE SAME master key (env `PREGAO_CREDENTIALS_MASTER_KEY`) so
 * operationally there is ONE key to rotate. The bot stores:
 *
 *   password_cipher (bytea) — AES-GCM ciphertext, no tag suffix
 *   password_nonce  (bytea) — iv (12 B) || tag (16 B) = 28 B
 *
 *   cookies_cipher  (bytea) — same layout, for the guided-login storage state
 *   cookies_nonce   (bytea)
 *
 * Format matches `encryptCredential` / `decryptCredential` in
 * packages/workers/src/pregao-chat-monitor/lib/crypto.ts so the web wizard
 * can write rows that this worker can decrypt, and vice versa.
 *
 * NEVER log the plaintext. NEVER return it in API responses.
 */

import {
  encryptCredential,
  decryptCredential,
  type EncryptedData,
} from '../../pregao-chat-monitor/lib/crypto'

export type { EncryptedData }

/**
 * Encrypts a secret string. Returns `{ cipher, nonce }` suitable for direct
 * storage into `bytea` columns.
 */
export function encryptSecret(plaintext: string): EncryptedData {
  return encryptCredential(plaintext)
}

/**
 * Decrypts a bytea pair back to plaintext. Throws on auth-tag mismatch — the
 * caller is expected to let that propagate so the portal login surfaces as
 * a real error instead of silently trying an empty password.
 */
export function decryptSecret(cipher: Buffer, nonce: Buffer): string {
  return decryptCredential(cipher, nonce)
}

/**
 * Helper to decrypt a bot_configs row's password + cookies in one call.
 *
 * Accepts both shapes:
 *   - ciphertext columns present  (post-phase-0 rows)    → decrypted
 *   - only legacy `password_hash` / `cookies` plaintext  → returned as-is
 *     with a warning field so callers can log + enqueue the row for
 *     backfill encryption.
 *
 * This preserves behavior during the backward-compat window. After the
 * one-shot migrator runs, all rows will hit the cipher path and the legacy
 * columns can be dropped.
 */
export interface BotConfigSecrets {
  password: string
  cookies: string | null
  /** True if either field came from a legacy plaintext column. */
  legacyPlaintext: boolean
}

export interface BotConfigRow {
  password_hash: string | null
  password_cipher: Buffer | Uint8Array | null
  password_nonce: Buffer | Uint8Array | null
  cookies: string | null
  cookies_cipher: Buffer | Uint8Array | null
  cookies_nonce: Buffer | Uint8Array | null
}

/**
 * Converte valor bytea de Supabase pra Buffer.
 *
 * Supabase/PostgREST retorna bytea de 3 formas diferentes dependendo da versão
 * e config:
 *   1. Buffer/Uint8Array direto (driver binário) — já é Buffer, OK
 *   2. String '\x<hex>' — formato Postgres default (hex com prefixo \x)
 *   3. String <hex> — hex sem prefixo
 *
 * Buffer.from(string) sem encoding gera bytes UTF-8 (cada caractere vira 1+
 * bytes), causando nonce 'gigante' (ex: 252-258 bytes quando deveria ser 12
 * ou 28). Isso quebrava a descriptografia das credenciais do bot.
 */
function byteaToBuffer(v: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(v)) return v
  if (v instanceof Uint8Array) return Buffer.from(v)
  if (typeof v === 'string') {
    // Formato Postgres: '\x' + hex
    if (v.startsWith('\\x')) return Buffer.from(v.slice(2), 'hex')
    // Hex puro (sem prefixo)
    if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) {
      return Buffer.from(v, 'hex')
    }
    // Fallback: trata como base64
    return Buffer.from(v, 'base64')
  }
  throw new Error(`bytea format desconhecido: typeof=${typeof v}`)
}

export function readBotConfigSecrets(row: BotConfigRow): BotConfigSecrets {
  let password: string
  let cookies: string | null = null
  let legacyPlaintext = false

  if (row.password_cipher && row.password_nonce) {
    password = decryptSecret(
      byteaToBuffer(row.password_cipher as Buffer | Uint8Array | string),
      byteaToBuffer(row.password_nonce as Buffer | Uint8Array | string),
    )
  } else if (row.password_hash) {
    password = row.password_hash
    legacyPlaintext = true
  } else {
    throw new Error(
      'bot_configs row has no password — neither ciphertext nor legacy plaintext is present',
    )
  }

  if (row.cookies_cipher && row.cookies_nonce) {
    cookies = decryptSecret(
      byteaToBuffer(row.cookies_cipher as Buffer | Uint8Array | string),
      byteaToBuffer(row.cookies_nonce as Buffer | Uint8Array | string),
    )
  } else if (row.cookies) {
    cookies = row.cookies
    legacyPlaintext = true
  }

  return { password, cookies, legacyPlaintext }
}
