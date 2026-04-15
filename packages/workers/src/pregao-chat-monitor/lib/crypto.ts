/**
 * Application-level credential encryption via sodium-native.
 *
 * Uses crypto_secretbox (XSalsa20-Poly1305) with a master key
 * from env PREGAO_CREDENTIALS_MASTER_KEY (32 bytes, hex-encoded).
 *
 * NEVER log plaintext credentials. NEVER return them in API responses.
 */

/// <reference path="./sodium-native.d.ts" />
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sodium = require('sodium-native')

// ─── Master Key ─────────────────────────────────────────────────────────────

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
  if (key.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error(
      `PREGAO_CREDENTIALS_MASTER_KEY must be ${sodium.crypto_secretbox_KEYBYTES} bytes (${sodium.crypto_secretbox_KEYBYTES * 2} hex chars). Got ${key.length} bytes.`,
    )
  }

  _masterKey = key
  return _masterKey
}

// ─── Encrypt ────────────────────────────────────────────────────────────────

export interface EncryptedData {
  cipher: Buffer
  nonce: Buffer
}

export function encryptCredential(plaintext: string): EncryptedData {
  const key = getMasterKey()
  const message = Buffer.from(plaintext, 'utf8')

  const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
  sodium.randombytes_buf(nonce)

  const cipher = Buffer.alloc(message.length + sodium.crypto_secretbox_MACBYTES)
  sodium.crypto_secretbox_easy(cipher, message, nonce, key)

  return { cipher, nonce }
}

// ─── Decrypt ────────────────────────────────────────────────────────────────

export function decryptCredential(cipher: Buffer, nonce: Buffer): string {
  const key = getMasterKey()

  const message = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES)
  const success = sodium.crypto_secretbox_open_easy(message, cipher, nonce, key)

  if (!success) {
    throw new Error('Decryption failed — invalid key or corrupted data')
  }

  return message.toString('utf8')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Encrypts both usuario and senha in a single call.
 * Returns cipher + shared nonce for both (same nonce is safe because
 * XSalsa20 nonce space is 192 bits — collision probability negligible).
 *
 * Actually, for maximum security, we use separate nonces per field.
 */
export function encryptCredentials(usuario: string, senha: string): {
  loginUsuarioCipher: Buffer
  loginSenhaCipher: Buffer
  loginNonce: Buffer
} {
  const key = getMasterKey()

  // Single nonce for both fields — safe with XSalsa20's 192-bit nonce
  const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
  sodium.randombytes_buf(nonce)

  const usuarioMsg = Buffer.from(usuario, 'utf8')
  const usuarioCipher = Buffer.alloc(usuarioMsg.length + sodium.crypto_secretbox_MACBYTES)
  sodium.crypto_secretbox_easy(usuarioCipher, usuarioMsg, nonce, key)

  // Use different nonce for senha for defense-in-depth
  const nonce2 = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES)
  sodium.randombytes_buf(nonce2)

  const senhaMsg = Buffer.from(senha, 'utf8')
  const senhaCipher = Buffer.alloc(senhaMsg.length + sodium.crypto_secretbox_MACBYTES)
  sodium.crypto_secretbox_easy(senhaCipher, senhaMsg, nonce2, key)

  // Store both nonces concatenated (each is fixed 24 bytes)
  const combinedNonce = Buffer.concat([nonce, nonce2])

  return {
    loginUsuarioCipher: usuarioCipher,
    loginSenhaCipher: senhaCipher,
    loginNonce: combinedNonce,
  }
}

/**
 * Decrypts usuario + senha from DB row.
 */
export function decryptCredentials(
  loginUsuarioCipher: Buffer,
  loginSenhaCipher: Buffer,
  loginNonce: Buffer,
): { usuario: string; senha: string } {
  const key = getMasterKey()
  const nonceSize = sodium.crypto_secretbox_NONCEBYTES

  // Split combined nonce
  const nonce1 = loginNonce.subarray(0, nonceSize)
  const nonce2 = loginNonce.subarray(nonceSize, nonceSize * 2)

  const usuarioMsg = Buffer.alloc(loginUsuarioCipher.length - sodium.crypto_secretbox_MACBYTES)
  if (!sodium.crypto_secretbox_open_easy(usuarioMsg, loginUsuarioCipher, nonce1, key)) {
    throw new Error('Failed to decrypt usuario — invalid key or corrupted data')
  }

  const senhaMsg = Buffer.alloc(loginSenhaCipher.length - sodium.crypto_secretbox_MACBYTES)
  if (!sodium.crypto_secretbox_open_easy(senhaMsg, loginSenhaCipher, nonce2, key)) {
    throw new Error('Failed to decrypt senha — invalid key or corrupted data')
  }

  return {
    usuario: usuarioMsg.toString('utf8'),
    senha: senhaMsg.toString('utf8'),
  }
}
