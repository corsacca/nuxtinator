import type { H3Event } from 'h3'
import { getRequestIP, getHeader, setResponseHeader } from 'h3'
import { checkRateLimit, logRateLimitExceeded } from '#core/server/utils/rate-limit'
import { logEvent } from '#core/server/utils/activity-logger'

// Client IP for rate-limit keying. Trustworthy only behind a proxy you control
// — X-Forwarded-For is otherwise caller-spoofable.
export function widgetClientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) || 'unknown'
}

// Enforce a sliding-window limit on `action` for one identifier (e.g. an IP or
// a project id). `checkRateLimit` only COUNTS prior `action` events in the
// window — it never records — so on each allowed request we log one; without
// that the window never fills and the limit never trips. Throws 429 (with
// Retry-After) when the limit is exceeded.
export async function enforceWidgetRateLimit(
  event: H3Event,
  action: string,
  field: string,
  value: string,
  max: number,
  windowMs: number
): Promise<void> {
  const rate = await checkRateLimit(action, field, value, windowMs, max)
  if (!rate.allowed) {
    logRateLimitExceeded(value, event.path, getHeader(event, 'user-agent') || undefined)
    if (rate.retryAfterSeconds) setResponseHeader(event, 'Retry-After', rate.retryAfterSeconds)
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
  // Record this attempt so it counts toward the window for later requests.
  logEvent({ eventType: action, metadata: { [field]: value } })
}
