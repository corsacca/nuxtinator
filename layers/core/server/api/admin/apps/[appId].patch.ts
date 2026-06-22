import { getRouterParam } from 'h3'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'
import { logEvent } from '../../../utils/activity-logger'

// Host-admin global status toggle.
//
// Materialization rules (per Phase 5.4):
//   * available → default: for every org without an explicit row, INSERT
//     `org_apps(enabled=true, source='auto')`. Fire `app.enabled` per row.
//     This makes layer hooks see "this app turned on" for orgs that
//     previously inherited 'available'=off, matching the user-visible flip.
//   * default → available: no row changes. Existing auto rows stay; new
//     orgs after the flip just won't auto-enable.
//   * anything → disabled: no row changes. Status alone gates.
//   * disabled → default: same as available → default.
//   * disabled → available: no row changes.
export default defineEventHandler(async (event) => {
  const { userId } = await requireOperatorAdmin(event)
  const appId = getRouterParam(event, 'appId')
  if (!appId) throw createError({ statusCode: 400, statusMessage: 'appId required' })
  const body = await readBody(event)
  const status = body?.status
  if (status !== 'disabled' && status !== 'available' && status !== 'default') {
    throw createError({ statusCode: 400, statusMessage: 'status must be disabled | available | default' })
  }

  const existing = await db.selectFrom('apps').select('status').where('id', '=', appId).executeTakeFirst()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'App not found' })

  const oldStatus = existing.status
  if (oldStatus === status) return { id: appId, status }

  // Per-org materialization (orgs/org_apps) is multi-tenant only — those tables
  // exist when the tenancy layer is loaded. In single-tenant mode the app status
  // alone gates visibility, so the status update is all there is to do.
  const tenancyEnabled = useRuntimeConfig(event).public.tenancy === true

  const now = new Date().toISOString()
  const flipsToDefault = status === 'default' && oldStatus !== 'default'
  let materializedOrgIds: string[] = []

  await db.transaction().execute(async (trx) => {
    await trx.updateTable('apps').set({ status, updated_at: now }).where('id', '=', appId).execute()

    if (flipsToDefault && tenancyEnabled) {
      // Find orgs with no row for this app; insert auto rows for each.
      const orgs = await (trx as any)
        .selectFrom('orgs')
        .leftJoin('org_apps', (join: any) => join.onRef('org_apps.org_id', '=', 'orgs.id').on('org_apps.app_id', '=', appId))
        .select('orgs.id as id')
        .where('org_apps.app_id', 'is', null)
        .execute() as Array<{ id: string }>
      materializedOrgIds = orgs.map(o => o.id)
      if (materializedOrgIds.length > 0) {
        await (trx as any)
          .insertInto('org_apps')
          .values(materializedOrgIds.map(id => ({
            org_id: id,
            app_id: appId,
            enabled: true,
            source: 'auto' as const,
            updated_at: now
          })))
          .execute()
      }
    }
  })

  const nitro = useNitroApp()
  for (const orgId of materializedOrgIds) {
    try {
      await nitro.hooks.callHook('app.enabled', { orgId, appId })
    } catch (err) { console.warn('[hook app.enabled]', err) }
  }

  logEvent({
    eventType: 'admin_app_status_changed',
    userId,
    metadata: { appId, oldStatus, newStatus: status, materializedOrgs: materializedOrgIds.length }
  }).catch(() => {})

  return { id: appId, status, materialized: materializedOrgIds.length }
})
