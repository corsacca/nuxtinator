import crypto from 'node:crypto'
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import { db } from './database'
import { getAuthUser } from './auth'
import type { Database } from '../database/schema'

interface LogEventOptions {
  eventType: string
  tableName?: string
  recordId?: string
  userId?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

export async function logEvent(
  options: LogEventOptions,
  executor: Kysely<Database> = db
): Promise<void> {
  try {
    await executor
      .insertInto('activity_logs')
      .values({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        event_type: options.eventType,
        table_name: options.tableName ?? null,
        record_id: options.recordId ?? null,
        user_id: options.userId ?? null,
        user_agent: options.userAgent ?? null,
        metadata: options.metadata ?? {}
      })
      .execute()
  }
  catch (err) {
    console.error('[fixture activity-logger] failed:', err)
  }
}

function getUserInfoFromEvent(event: H3Event | null): { userId?: string; userAgent?: string } {
  if (!event) return {}
  const user = getAuthUser(event)
  const userAgent = getHeader(event, 'user-agent') || undefined
  return { userId: user?.userId, userAgent }
}

export function logCreate(
  tableName: string,
  recordId: string,
  userIdOrEvent?: string | H3Event,
  metadata?: Record<string, unknown>
): void {
  const info = typeof userIdOrEvent === 'string'
    ? { userId: userIdOrEvent }
    : getUserInfoFromEvent(userIdOrEvent ?? null)
  void logEvent({ eventType: 'CREATE', tableName, recordId, ...info, metadata })
}

export function logUpdate(
  tableName: string,
  recordId: string,
  userIdOrEvent?: string | H3Event,
  metadata?: Record<string, unknown>
): void {
  const info = typeof userIdOrEvent === 'string'
    ? { userId: userIdOrEvent }
    : getUserInfoFromEvent(userIdOrEvent ?? null)
  void logEvent({ eventType: 'UPDATE', tableName, recordId, ...info, metadata })
}

export function logDelete(
  tableName: string,
  recordId: string,
  userIdOrEvent?: string | H3Event,
  metadata?: Record<string, unknown>
): void {
  const info = typeof userIdOrEvent === 'string'
    ? { userId: userIdOrEvent }
    : getUserInfoFromEvent(userIdOrEvent ?? null)
  void logEvent({ eventType: 'DELETE', tableName, recordId, ...info, metadata })
}
