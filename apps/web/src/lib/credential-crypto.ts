/**
 * Server-side credential encryption for the Next.js web app.
 *
 * AES-256-GCM via Node.js built-in `crypto`. Matches the layout expected by
 * the workers at `packages/workers/src/pregao-chat-monitor/lib/crypto.ts`
 * and the re-export at `packages/workers/src/bot/lib/crypto.ts`.
 *
 * Single-field (password, storage_state, cookies JSON):
 *   cipher  = ciphertext only (no tag suffix)
 *   nonce   = iv (12 B) || tag (16 B) = 28 B
 *
 * Dual-field (usuario + senha, deprecated in favor of single-field):
 *   loginUsuarioCipher = ciphertext_u || tag_u
 *   loginSenhaCipher   = ciphertext_s || tag_s
 *   loginNonce         = iv_u (12 B) || iv_s (12 B) = 24 B
 *
 * The master key MUST be set in env `PREGAO_CREDENTIALS_MASTER_KEY`
 * (32 bytes, hex encoded → 64 hex chars). Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * NEVER log the plaintext. NEVER return the plaintext in API responses.
 * NEVER echo it back even masked — the mask should be a fixed placeholder
 * (e.g. '••••••••') so the cipher value can't be inferred from its length.
 */

import * as crypto from 'node:crypto'

const IV_LENGTH = 12
const TAG_LENGTH = 16

let _masterKey: Buffer | null = null

function getMasterKey(): Buffer {
  if (_masterKey) return _masterKey
  const hex = process.env.PREGAO_CREDENTIALS_MASTER_KEY
  if (!hex) {
    throw new Error(
      'PREGAO_CREDENTIALS_MASTER_KEY env var is required for credential encryption',
    )
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error(
      `PREGAO_CREDENTIALS_MASTER_KEY must be 32 bytes (64 hex chars); got ${key.length}`,
    )
  }
  _masterKey = key
  return key
}

/** Returns whether a master key is configured without throwing. */
export function hasCredentialMasterKey(): boolean {
  try {
    getMasterKey()
    return true
  } catch {
    return false
  }
}

export interface EncryptedBlob {
  /** Ciphertext bytes (no tag suffix). */
  cipher: Buffer
  /** iv (12) || tag (16) = 28 bytes. */
  nonce: Buffer
}

/**
 * Encrypts a plaintext string with a fresh random IV.
 */
export function encryptSecret(plaintext: string): EncryptedBlob {
  const key = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const ciph = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([ciph.update(plaintext, 'utf8'), ciph.final()])
  const tag = ciph.getAuthTag()
  return { cipher: ciphertext, nonce: Buffer.concat([iv, tag]) }
}

/**
 * Decrypts a ciphertext blob. Supports both layouts for backward compat:
 *   - current (v2):  nonce = iv(12) || tag(16); cipher = ciphertext only
 *   - legacy (v1):   nonce = iv(12);            cipher = ciphertext || tag(16)
 */
export function decryptSecret(cipherBuf: Buffer, nonceBuf: Buffer): string {
  const key = getMasterKey()

  let iv: Buffer
  let tag: Buffer
  let ciphertext: Buffer

  if (nonceBuf.length === IV_LENGTH + TAG_LENGTH) {
    iv = nonceBuf.subarray(0, IV_LENGTH)
    tag = nonceBuf.subarray(IV_LENGTH)
    ciphertext = cipherBuf
  } else if (nonceBuf.length === IV_LENGTH) {
    iv = nonceBuf
    if (cipherBuf.length < TAG_LENGTH) {
      throw new Error('Ciphertext too short to contain GCM tag')
    }
    tag = cipherBuf.subarray(cipherBuf.length - TAG_LENGTH)
    ciphertext = cipherBuf.subarray(0, cipherBuf.length - TAG_LENGTH)
  } else {
    throw new Error(
      `Unexpected nonce length ${nonceBuf.length} (expected 12 or 28)`,
    )
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/**
 * Dual-field encryption used by the pregão-chat-monitor wizard (usuario + senha).
 * Kept for backwards compatibility with the existing schema on
 * `pregao_portais_credenciais`.
 */
export function encryptLoginPair(usuario: string, senha: string): {
  loginUsuarioCipher: Buffer
  loginSenhaCipher: Buffer
  loginNonce: Buffer
} {
  const key = getMasterKey()
  const iv1 = crypto.randomBytes(IV_LENGTH)
  const c1 = crypto.createCipheriv('aes-256-gcm', key, iv1)
  const loginUsuarioCipher = Buffer.concat([
    c1.update(usuario, 'utf8'),
    c1.final(),
    c1.getAuthTag(),
  ])
  const iv2 = crypto.randomBytes(IV_LENGTH)
  const c2 = crypto.createCipheriv('aes-256-gcm', key, iv2)
  const loginSenhaCipher = Buffer.concat([
    c2.update(senha, 'utf8'),
    c2.final(),
    c2.getAuthTag(),
  ])
  return { loginUsuarioCipher, loginSenhaCipher, loginNonce: Buffer.concat([iv1, iv2]) }
}
