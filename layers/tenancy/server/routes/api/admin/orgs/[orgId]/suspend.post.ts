import { getRouterParam } from 'h3'
import { adminDb } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'

// Toggle suspension. Body: { suspended: boolean }. When suspended,
// `withOrgContext` returns 423 for any org-scoped request.
export default defineEventHandler(async (event) => {
  const { userId } = await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'orgId required' })
  const body = await readBody(event)
  const suspended = body?.suspended === true

  await adminDb
    .updateTable('orgs')
    .set({ suspended_at: suspended ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .where('id', '=', orgId)
    .execute()

  logEvent({
    eventType: suspended ? 'org_suspended' : 'org_unsuspended',
    userId,
    metadata: { orgId }
  }).catch(() => {})

  return { id: orgId, suspended }
})
