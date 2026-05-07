import { getRouterParam } from 'h3'
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.apps.manage', async (tx, ctx) => {
    const appId = getRouterParam(event, 'appId')
    if (!appId) throw createError({ statusCode: 400, statusMessage: 'appId required' })

    const app = await tx.selectFrom('apps').select('id').where('id', '=', appId).executeTakeFirst()
    if (!app) throw createError({ statusCode: 404, statusMessage: 'App not found' })

    const now = new Date().toISOString()
    await tx
      .insertInto('org_apps')
      .values({ org_id: ctx.orgId, app_id: appId, enabled: false, source: 'org_admin', updated_at: now })
      .onConflict(oc => oc.columns(['org_id', 'app_id']).doUpdateSet({
        enabled: false,
        source: 'org_admin',
        updated_at: now
      }))
      .execute()

    const nitro = useNitroApp()
    try {
      await nitro.hooks.callHook('app.disabled', { orgId: ctx.orgId, appId })
    } catch (err) { console.warn('[hook app.disabled]', err) }

    return { success: true, enabled: false, source: 'org_admin' }
  })
})
