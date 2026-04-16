/**
 * Application-level credential encryption via Node.js built-in crypto (AES-256-GCM).
 *
 * Uses AES-256-GCM authenticated encryption with a master key from env
 * PREGAO_CREDENTIALS_MASTER_KEY (32 bytes, hex-encoded).
 *
 * Format of `login_nonce`: 24 bytes = iv_u (12) || iv_s (12) for usuario/senha fields.
 * Each cipher blob is: ciphertext || tag (16 bytes) — matches what the web wizard
 * writes at apps/web/src/app/api/pregao-chat/credentials/route.ts (POST).
 *
 * For single-field encrypt/decrypt (storage_state), the nonce is 12 (iv) + 16 (tag) = 28 bytes.
 * The decrypt path also supports the legacy 12-byte iv layout (cipher has tag suffix).
 *
 * NEVER log plaintext credentials. NEVER return them in API responses.
 */

import * as crypto from 'node:crypto'

// ─── Master Key ─────────────────────────────────────────────────────────────

const IV_LENGTH = 12 // GCM recommended IV length
const TAG_LENGTH = 16 // GCM auth tag length (default)

let _masterKey: Buffer | null = null

function getMasterKey(): Buffer {
  if (_masterKey) return _masterKey

  const hex = process.env.PREGAO_CREDENTIALS_MASTER_KEY
  if (!hex) {
    throw new Error(
      'PREGAO_CREDENTIALS_MASTER_KEY env var is required. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }

  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error(
      `PREGAO_CREDENTIALS_MASTER_KEY must be 32 bytes (64 hex chars). Got ${key.length} bytes.`,
    )
  }

  _masterKey = key
  return _masterKey
}

// ─── Encrypt single field (for storage_state) ───────────────────────────────

export interface EncryptedData {
  cipher: Buffer
  nonce: Buffer
}

/**
 * Encrypts a plaintext string. Returns:
 *   cipher: encrypted bytes (ciphertext only, no tag)
 *   nonce:  iv (12 bytes) || tag (16 bytes) = 28 bytes total
 */
export function encryptCredential(plaintext: string): EncryptedData {
  const key = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const ciph = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([ciph.update(plaintext, 'utf8'), ciph.final()])
  const tag = ciph.getAuthTag()

  return {
    cipher: ciphertext,
    nonce: Buffer.concat([iv, tag]),
  }
}

/**
 * Decrypts a ciphertext produced by encryptCredential.
 * Supports two layouts for backwards compatibility:
 *   - v2 (current): nonce = iv(12) || tag(16); cipher = ciphertext only.
 *   - v1 (web wizard): nonce = iv(12); cipher = ciphertext || tag(16).
 */
export function decryptCredential(cipherBuf: Buffer, nonceBuf: Buffer): string {
  const key = getMasterKey()

  let iv: Buffer
  let tag: Buffer
  let ciphertext: Buffer

  if (nonceBuf.length === IV_LENGTH + TAG_LENGTH) {
    iv = nonceBuf.subarray(0, IV_LENGTH)
    tag = nonceBuf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    ciphertext = cipherBuf
  } else if (nonceBuf.length === IV_LENGTH) {
    iv = nonceBuf
    if (cipherBuf.length < TAG_LENGTH) {
      throw new Error('Ciphertext too short to contain GCM tag')
    }
    tag = cipherBuf.subarray(cipherBuf.length - TAG_LENGTH)
    ciphertext = cipherBuf.subarray(0, cipherBuf.length - TAG_LENGTH)
  } else {
    throw new Error(`Unexpected nonce length: ${nonceBuf.length} (expected ${IV_LENGTH} or ${IV_LENGTH + TAG_LENGTH})`)
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plain.toString('utf8')
}

// ─── Encrypt both usuario + senha ───────────────────────────────────────────

/**
 * Encrypts usuario + senha with the AES-256-GCM layout expected by the DB.
 * Matches what apps/web/src/app/api/pregao-chat/credentials/route.ts (POST) writes:
 *   loginUsuarioCipher = ciphertext_u || tag_u
 *   loginSenhaCipher   = ciphertext_s || tag_s
 *   loginNonce         = iv_u (12) || iv_s (12)  [= 24 bytes]
 *
 * This guarantees interoperability between the web wizard (which encrypts) and
 * the workers (which decrypt during login tests and polls).
 */
export function encryptCredentials(usuario: string, senha: string): {
  loginUsuarioCipher: Buffer
  loginSenhaCipher: Buffer
  loginNonce: Buffer
} {
  const key = getMasterKey()

  const iv1 = crypto.randomBytes(IV_LENGTH)
  const cipher1 = crypto.createCipheriv('aes-256-gcm', key, iv1)
  const loginUsuarioCipher = Buffer.concat([
    cipher1.update(usuario, 'utf8'),
    cipher1.final(),
    cipher1.getAuthTag(),
  ])

  const iv2 = crypto.randomBytes(IV_LENGTH)
  const cipher2 = crypto.createCipheriv('aes-256-gcm', key, iv2)
  const loginSenhaCipher = Buffer.concat([
    cipher2.update(senha, 'utf8'),
    cipher2.final(),
    cipher2.getAuthTag(),
  ])

  return {
    loginUsuarioCipher,
    loginSenhaCipher,
    loginNonce: Buffer.concat([iv1, iv2]),
  }
}

/**
 * Decrypts usuario + senha from DB row, matching the layout written by the web wizard.
 *   loginNonce = iv_u (12) || iv_s (12)
 *   each cipher blob = ciphertext || tag (16)
 */
export function decryptCredentials(
  loginUsuarioCipher: Buffer,
  loginSenhaCipher: Buffer,
  loginNonce: Buffer,
): { usuario: string; senha: string } {
  const key = getMasterKey()

  if (loginNonce.length !== IV_LENGTH * 2) {
    throw new Error(
      `Unexpected login_nonce length: ${loginNonce.length} (expected ${IV_LENGTH * 2})`,
    )
  }

  const iv1 = loginNonce.subarray(0, IV_LENGTH)
  const iv2 = loginNonce.subarray(IV_LENGTH, IV_LENGTH * 2)

  function decryptBlob(blob: Buffer, iv: Buffer, label: string): string {
    if (blob.length < TAG_LENGTH) {
      throw new Error(`${label} cipher too short`)
    }
    const ciphertext = blob.subarray(0, blob.length - TAG_LENGTH)
    const tag = blob.subarray(blob.length - TAG_LENGTH)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    } catch {
      throw new Error(`Failed to decrypt ${label} — invalid key or corrupted data`)
    }
  }

  return {
    usuario: decryptBlob(loginUsuarioCipher, iv1, 'usuario'),
    senha: decryptBlob(loginSenhaCipher, iv2, 'senha'),
  }
}
