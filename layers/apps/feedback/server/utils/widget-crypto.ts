import crypto from 'crypto'

// Self-contained crypto primitives for the widget sign-in flow. Kept inside the
// feedback layer (rather than importing the oauth layer's helpers) so feedback
// stays independent of whether the oauth layer is loaded. Names are widget-
// scoped to avoid colliding with the oauth layer's identically-shaped helpers
// in the shared server auto-import namespace.

export function widgetSha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

// URL-safe high-entropy token (base64url, no padding). Used for the one-time
// authorization code handed back to the embedding site.
export function randomUrlToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

// base64url(SHA-256(verifier)), no padding — RFC 7636 §4.2 (S256).
export function widgetS256Challenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// RFC 7636 §4.1: verifier is 43–128 chars from [A-Za-z0-9-._~].
export function isValidWidgetVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)
}

// S256 challenge: base64url(SHA-256(...)) without padding → 43 chars [A-Za-z0-9-_].
export function isValidWidgetChallenge(challenge: string): boolean {
  return /^[A-Za-z0-9\-_]{43}$/.test(challenge)
}

// Constant-time compare; returns false (not throw) on length mismatch.
export function widgetTimingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}
