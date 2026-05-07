import { getQuery } from 'h3'
import { withOrgPermission } from '#tenant/server'

// Per-org audit log view. RLS scopes `activity_logs` to rows whose `org_id`
// matches `app.current_org`; rows with `org_id IS NULL` (host-wide events) are
// invisible inside `withOrgContext`. Visible only to org admins (gated by
// `org.settings.write` — same gate that protects sensitive config edits).
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.settings.write', async (tx, ctx) => {
    const q = getQuery(event)
    const limit = Math.min(Math.max(parseInt(String(q.limit ?? '100'), 10) || 100, 1), 500)
    const before = typeof q.before === 'string' ? q.before : null

    let qb = tx
      .selectFrom('activity_logs')
      .leftJoin('users', 'users.id', 'activity_logs.user_id')
      .select([
        'activity_logs.id as id',
        'activity_logs.timestamp as timestamp',
        'activity_logs.event_type as event_type',
        'activity_logs.table_name as table_name',
        'activity_logs.record_id as record_id',
        'activity_logs.user_id as user_id',
        'activity_logs.metadata as metadata',
        'users.email as user_email',
        'users.display_name as user_display_name'
      ])
      .where('activity_logs.org_id', '=', ctx.orgId)
      .orderBy('activity_logs.timestamp', 'desc')
      .limit(limit + 1)

    if (before) {
      qb = qb.where('activity_logs.timestamp', '<', before)
    }

    const rows = await qb.execute()
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    return {
      logs: page,
      nextCursor: hasMore ? page[page.length - 1]!.timestamp : null
    }
  })
})
