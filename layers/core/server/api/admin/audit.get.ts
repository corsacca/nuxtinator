import { getQuery } from 'h3'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'

// Host-wide audit log view. Runs on `adminDb` (BYPASSRLS) so host-wide events
// (login, register, host-admin actions — all with `org_id=null`) appear
// alongside org-scoped rows. Optional `?orgId=` filter narrows to one org.
export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)
  const q = getQuery(event)
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? '100'), 10) || 100, 1), 500)
  const before = typeof q.before === 'string' ? q.before : null
  const orgIdFilter = typeof q.orgId === 'string' && q.orgId.length > 0 ? q.orgId : null
  const hostOnly = q.hostOnly === '1' || q.hostOnly === 'true'

  let qb = db
    .selectFrom('activity_logs')
    .leftJoin('users', 'users.id', 'activity_logs.user_id')
    .leftJoin('orgs', 'orgs.id', 'activity_logs.org_id')
    .select([
      'activity_logs.id as id',
      'activity_logs.timestamp as timestamp',
      'activity_logs.event_type as event_type',
      'activity_logs.table_name as table_name',
      'activity_logs.record_id as record_id',
      'activity_logs.user_id as user_id',
      'activity_logs.org_id as org_id',
      'activity_logs.metadata as metadata',
      'users.email as user_email',
      'users.display_name as user_display_name',
      'orgs.slug as org_slug',
      'orgs.name as org_name'
    ])
    .orderBy('activity_logs.timestamp', 'desc')
    .limit(limit + 1)

  if (orgIdFilter) {
    qb = qb.where('activity_logs.org_id', '=', orgIdFilter)
  } else if (hostOnly) {
    qb = qb.where('activity_logs.org_id', 'is', null)
  }
  if (before) {
    qb = qb.where('activity_logs.timestamp', '<', new Date(before))
  }

  const rows = await qb.execute()
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return {
    logs: page,
    nextCursor: hasMore ? page[page.length - 1]!.timestamp : null
  }
})
