import { withOrgContext } from '#tenant/server'
import { getOrgApps } from '../../../../../utils/app-settings'

// Per-org app status. Registry-first three-tier merge — see
// `server/utils/app-settings.ts`. UI for `/@<slug>/settings/apps`.
export default defineEventHandler((event) => {
  return withOrgContext(event, async (tx, ctx) => {
    const apps = await getOrgApps(tx, { orgId: ctx.orgId })
    return {
      apps: apps.map(a => ({
        appId: a.id,
        title: a.title,
        description: a.description,
        icon: a.icon,
        globalStatus: a.globalStatus,
        enabled: a.enabled,
        source: a.source,
        lockedByHost: a.lockedByHost
      }))
    }
  })
})
