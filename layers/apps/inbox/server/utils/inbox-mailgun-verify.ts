// Mailgun webhook signature verification.
//
// Mailgun signs every webhook with HMAC-SHA256 over `timestamp + token` using
// the account's webhook signing key (a different key than the sending API
// key). Inbound routes post the fields at the top level; event webhooks
// (delivery) nest them under `signature`.
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface InboxMailgunSignature {
  timestamp: string
  token: string
  signature: string
}

const MAX_AGE_SECONDS = 10 * 60

// Best-effort, per-instance replay defense. Combined with the staleness
// window and the Message-Id idempotency of the pipelines behind it, this is
// sufficient; it is deliberately not shared across instances.
const seenTokens = new Map<string, number>()

function pruneSeenTokens(now: number) {
  if (seenTokens.size < 5000) return
  for (const [token, ts] of seenTokens) {
    if (now - ts > MAX_AGE_SECONDS * 1000) seenTokens.delete(token)
  }
}

function verifySignature(sig: InboxMailgunSignature, signingKey: string): boolean {
  if (!signingKey || !sig?.signature || !sig?.timestamp || !sig?.token) return false
  const expected = createHmac('sha256', signingKey)
    .update(sig.timestamp + sig.token)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(sig.signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function isStale(timestamp: string): boolean {
  const ts = parseInt(timestamp, 10)
  if (Number.isNaN(ts)) return true
  return Math.abs(Date.now() / 1000 - ts) > MAX_AGE_SECONDS
}

function isReplayedToken(token: string): boolean {
  const now = Date.now()
  pruneSeenTokens(now)
  if (seenTokens.has(token)) return true
  seenTokens.set(token, now)
  return false
}

// Release a token previously marked seen. Call this when a webhook returns a
// retryable 5xx: Mailgun's retry resends the *same* token, so leaving it
// recorded would reject the retry as a replay and lose the message. A genuine
// replay attack only resends an already-*succeeded* webhook, which is never
// released.
export function inboxReleaseSeenToken(token: string): void {
  if (token) seenTokens.delete(token)
}

// Validate a Mailgun webhook signature, returning a reason on failure.
export function inboxValidateMailgunWebhook(
  sig: InboxMailgunSignature,
  signingKey: string
): { ok: boolean, reason?: string } {
  if (!verifySignature(sig, signingKey)) return { ok: false, reason: 'Invalid signature' }
  if (isStale(sig.timestamp)) return { ok: false, reason: 'Stale signature' }
  if (isReplayedToken(sig.token)) return { ok: false, reason: 'Replayed token' }
  return { ok: true }
}
