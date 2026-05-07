import { sql } from 'kysely'
import { db } from './database'
import { logEvent } from './activity-logger'

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds?: number
}

/**
 * Check rate limit by counting recent events in activity_logs.
 * Uses metadata JSONB field to match identifier (email or IP).
 */
export async function checkRateLimit(
  eventType: string,
  identifierField: string,
  identifierValue: string,
  windowMs: number,
  maxAttempts: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowMs)

  try {
    const result = await db
      .selectFrom('activity_logs')
      .select([
        sql<number>`COUNT(*)::int`.as('count'),
        sql<Date | null>`MIN(timestamp)`.as('oldest_attempt')
      ])
      .where('event_type', '=', eventType)
      .where(sql`metadata->>${sql.lit(identifierField)}`, '=', identifierValue)
      .where('timestamp', '>', windowStart)
      .executeTakeFirst()

    const count = result?.count || 0
    const oldestAttempt = result?.oldest_attempt

    if (count >= maxAttempts) {
      const retryAfterMs = oldestAttempt
        ? (new Date(oldestAttempt).getTime() + windowMs) - Date.now()
        : windowMs

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
      }
    }

    return {
      allowed: true,
      remaining: maxAttempts - count
    }
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Fail open - allow request if rate limit check fails
    return {
      allowed: true,
      remaining: maxAttempts
    }
  }
}

/**
 * Log when rate limit is exceeded (for monitoring)
 */
export function logRateLimitExceeded(
  identifier: string,
  endpoint: string,
  userAgent?: string
): void {
  logEvent({
    eventType: 'RATE_LIMIT_EXCEEDED',
    userAgent,
    metadata: { identifier, endpoint }
  })
}
