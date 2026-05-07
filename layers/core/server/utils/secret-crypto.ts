import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

let _keyCache: Buffer | null = null

function getKey(): Buffer {
  if (_keyCache) return _keyCache
  const hex = useRuntimeConfig().secretEncryptionKey
  if (!hex) throw new Error('NUXT_SECRET_ENCRYPTION_KEY is not set')
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== KEY_BYTES) {
    throw new Error(`NUXT_SECRET_ENCRYPTION_KEY must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars); got ${buf.length} bytes`)
  }
  _keyCache = buf
  return _keyCache
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decryptSecret(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64')
  if (buf.length < IV_BYTES + TAG_BYTES) throw new Error('ciphertext too short')
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ct = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value))
}

export function decryptJson<T = unknown>(ciphertext: string): T {
  return JSON.parse(decryptSecret(ciphertext)) as T
}
