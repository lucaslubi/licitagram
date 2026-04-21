/**
 * AES-256-GCM encryption — mesmo formato usado em
 * packages/workers/src/pregao-chat-monitor/lib/crypto.ts
 *
 * Compartilha a master key (env PREGAO_CREDENTIALS_MASTER_KEY) pra que
 * o web e o worker possam criptografar/descriptografar as mesmas linhas
 * na tabela bot_tokens e bot_configs.
 *
 * Formato:
 *   cipher (bytea) = ciphertext || tag(16) — concatenado
 *   nonce  (bytea) = iv(12) || tag(16) = 28 bytes
 */

import crypto from 'node:crypto'

const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_LENGTH = 32 // AES-256

let _cachedKey: Buffer | null = null

function getMasterKey(): Buffer {
  if (_cachedKey) return _cachedKey
  const raw = process.env.PREGAO_CREDENTIALS_MASTER_KEY
  if (!raw) {
    throw new Error('PREGAO_CREDENTIALS_MASTER_KEY não configurada no env')
  }
  // Aceita hex (64 chars) ou base64 (44 chars) ou raw 32 bytes
  let key: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else if (raw.length >= 44 && /^[A-Za-z0-9+/=]+$/.test(raw)) {
    key = Buffer.from(raw, 'base64')
  } else {
    // Deriva via SHA-256 se não for hex nem base64 de 32 bytes
    key = crypto.createHash('sha256').update(raw, 'utf8').digest()
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `PREGAO_CREDENTIALS_MASTER_KEY decoded em ${key.length} bytes, esperado ${KEY_LENGTH}`,
    )
  }
  _cachedKey = key
  return key
}

export interface EncryptedData {
  cipher: Buffer
  nonce: Buffer
}

export function encryptCredential(plaintext: string): EncryptedData {
  const key = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipherObj = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipherObj.update(plaintext, 'utf8'), cipherObj.final()])
  const tag = cipherObj.getAuthTag()
  // Layout v2: nonce = iv || tag (28 bytes), cipher = ciphertext
  const nonce = Buffer.concat([iv, tag])
  return { cipher: encrypted, nonce }
}

export function decryptCredential(cipherBuf: Buffer, nonceBuf: Buffer): string {
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
    if (cipherBuf.length < TAG_LENGTH) throw new Error('Ciphertext curto')
    tag = cipherBuf.subarray(cipherBuf.length - TAG_LENGTH)
    ciphertext = cipherBuf.subarray(0, cipherBuf.length - TAG_LENGTH)
  } else {
    throw new Error(`nonce length inválido: ${nonceBuf.length}`)
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plain.toString('utf8')
}
