import { withOrgContext } from '#tenant/server'
import { getRegisteredApps } from '#core/server/utils/app-registry'

// Per-org app status — each registered app, augmented with its global status
// and any per-org override. UI for `/@<slug>/settings/apps`.
export default defineEventHandler(async (event) => {
  return await withOrgContext(event, async (tx, ctx) => {
    const apps = await tx.selectFrom('apps').select(['id', 'status']).execute()
    const orgApps = await tx
      .selectFrom('org_apps')
      .select(['app_id', 'enabled', 'source'])
      .where('org_id', '=', ctx.orgId)
      .execute()
    const orgMap = new Map(orgApps.map(r => [r.app_id, r]))

    const registered = new Map(getRegisteredApps().map(a => [a.id, a]))

    return {
      apps: apps.map((app) => {
        const reg = registered.get(app.id)
        const explicit = orgMap.get(app.id)
        let enabled: boolean
        if (app.status === 'disabled') enabled = false
        else if (explicit) enabled = explicit.enabled
        else enabled = app.status === 'default'

        return {
          appId: app.id,
          title: reg?.title ?? app.id,
          description: reg?.description,
          icon: reg?.icon,
          globalStatus: app.status,
          enabled,
          source: explicit?.source ?? null,
          // The host can disable globally — org admin can't override that.
          lockedByHost: app.status === 'disabled'
        }
      })
    }
  })
})
