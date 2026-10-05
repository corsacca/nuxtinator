import type { H3Event } from 'h3'
import { getRequestIP, getHeader, setResponseHeader } from 'h3'
import { consumeRateLimit, logRateLimitExceeded } from '#core/server/utils/rate-limit'

// Client IP for rate-limit keying. Trustworthy only behind a proxy you control
// — X-Forwarded-For is otherwise caller-spoofable.
export function widgetClientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) || 'unknown'
}

// Enforce a sliding-window limit on `action` for one identifier (e.g. an IP or
// a project id). Counts and records in one locked step, so parallel requests
// can't all read the same count and pass. Throws 429 (with Retry-After) when
// the limit is exceeded.
export async function enforceWidgetRateLimit(
  event: H3Event,
  action: string,
  field: string,
  value: string,
  max: number,
  windowMs: number
): Promise<void> {
  const rate = await consumeRateLimit(action, field, value, windowMs, max)
  if (!rate.allowed) {
    logRateLimitExceeded(value, event.path, getHeader(event, 'user-agent') || undefined)
    if (rate.retryAfterSeconds) setResponseHeader(event, 'Retry-After', rate.retryAfterSeconds)
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
}
