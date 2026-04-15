declare module 'sodium-native' {
  export const crypto_secretbox_KEYBYTES: number
  export const crypto_secretbox_NONCEBYTES: number
  export const crypto_secretbox_MACBYTES: number
  export function randombytes_buf(buf: Buffer): void
  export function crypto_secretbox_easy(cipher: Buffer, message: Buffer, nonce: Buffer, key: Buffer): void
  export function crypto_secretbox_open_easy(message: Buffer, cipher: Buffer, nonce: Buffer, key: Buffer): boolean
}
