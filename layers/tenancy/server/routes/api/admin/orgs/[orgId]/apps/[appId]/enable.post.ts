import { getRouterParam } from 'h3'
import { adminDb as db } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'

// Host admin force-enables an app for one org. Marked source='host' so the
// org-side UI can show "Forced on by host".
export default defineEventHandler(async (event) => {
  await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  const appId = getRouterParam(event, 'appId')
  if (!orgId || !appId) throw createError({ statusCode: 400, statusMessage: 'orgId and appId required' })

  const app = await db.selectFrom('apps').select('id').where('id', '=', appId).executeTakeFirst()
  if (!app) throw createError({ statusCode: 404, statusMessage: 'App not found' })

  const now = new Date().toISOString()
  await db
    .insertInto('org_apps')
    .values({ org_id: orgId, app_id: appId, enabled: true, source: 'host', updated_at: now })
    .onConflict(oc => oc.columns(['org_id', 'app_id']).doUpdateSet({
      enabled: true, source: 'host', updated_at: now
    }))
    .execute()

  const nitro = useNitroApp()
  try {
    await nitro.hooks.callHook('app.enabled', { orgId, appId })
  } catch (err) { console.warn('[hook app.enabled]', err) }

  return { success: true }
})
