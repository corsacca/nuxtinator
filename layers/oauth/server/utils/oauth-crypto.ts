import crypto from 'crypto'

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function randomTokenHex(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}

export function randomClientId(): string {
  return `mcp_${crypto.randomBytes(8).toString('hex')}`
}

export function newAccessToken(): string {
  return `oat_${randomTokenHex(32)}`
}

export function newRefreshToken(): string {
  return `ort_${randomTokenHex(32)}`
}

export function newAuthorizationCode(): string {
  return randomTokenHex(32)
}

export function newCsrfToken(): string {
  return randomTokenHex(32)
}

// Constant-time string compare using byte buffers of equal length.
// Both inputs must be the same length — pad or reject before calling.
export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

// base64url of SHA-256(verifier), no padding — RFC 7636 §4.2
export function s256Challenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

// RFC 7636 §4.1: verifier is 43–128 chars from [A-Za-z0-9-._~]
export function isValidPkceVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)
}

// S256 challenge: base64url(SHA-256(verifier)) without padding → always 43 chars from [A-Za-z0-9-_]
export function isValidS256Challenge(challenge: string): boolean {
  return /^[A-Za-z0-9\-_]{43}$/.test(challenge)
}

// HMAC-SHA256 signed cookie payload used for the consent-cookie (request_id → csrf plaintext).
// Format: base64url(payloadJson).base64url(hmac)
export function signCookiePayload(payload: object, secret: string): string {
  const json = JSON.stringify(payload)
  const payloadB64 = Buffer.from(json).toString('base64url')
  const hmac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${hmac}`
}

export function verifyCookiePayload<T = unknown>(signed: string, secret: string): T | null {
  const idx = signed.indexOf('.')
  if (idx === -1) return null
  const payloadB64 = signed.slice(0, idx)
  const sig = signed.slice(idx + 1)
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length) return null
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
