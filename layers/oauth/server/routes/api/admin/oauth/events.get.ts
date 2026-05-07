// Admin: paginated read of activity_logs filtered to OAuth events.
// All `oauth.*` event types — code issued/reused, consent
// granted/denied/revoked, token issued/refreshed/reused, client
// registered/enabled/disabled, family revoked-by-admin.
//
// Joins users.email so the table can show "who" without a second
// hop. Metadata.client_id, metadata.reason, metadata.ip are
// surfaced as-is for the UI to render or hide.

import { sql } from 'kysely'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const query = getQuery(event)
  const pageRaw = Number(query.page ?? 1)
  const pageSizeRaw = Number(query.pageSize ?? 50)
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 && pageSizeRaw <= 200
    ? Math.floor(pageSizeRaw)
    : 50

  const eventType = typeof query.event_type === 'string' && query.event_type.startsWith('oauth.')
    ? query.event_type
    : null

  const totalRow = await db
    .selectFrom('activity_logs')
    .select(eb => eb.fn.countAll<string>().as('count'))
    .where('event_type', 'like', 'oauth.%')
    .$if(!!eventType, qb => qb.where('event_type', '=', eventType!))
    .executeTakeFirst()
  const total = Number(totalRow?.count ?? 0)

  const rows = await db
    .selectFrom('activity_logs')
    .leftJoin('users', 'users.id', 'activity_logs.user_id')
    .select([
      'activity_logs.id',
      'activity_logs.timestamp',
      'activity_logs.event_type',
      'activity_logs.user_id',
      'activity_logs.metadata',
      'activity_logs.user_agent',
      'users.email as user_email'
    ])
    .where('activity_logs.event_type', 'like', 'oauth.%')
    .$if(!!eventType, qb => qb.where('activity_logs.event_type', '=', eventType!))
    .orderBy(sql`activity_logs.timestamp desc`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .execute()

  return {
    rows: rows.map(r => ({
      id: r.id,
      timestamp: new Date(r.timestamp as unknown as string).toISOString(),
      event_type: r.event_type,
      user_id: r.user_id,
      user_email: r.user_email,
      user_agent: r.user_agent,
      metadata: r.metadata
    })),
    total,
    page,
    pageSize
  }
})
