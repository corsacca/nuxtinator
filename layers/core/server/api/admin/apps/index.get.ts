import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'
import { getRegisteredApps } from '../../../utils/app-registry'

// Host admin: list every catalog row, joined with its registered metadata.
export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)
  const rows = await db.selectFrom('apps').select(['id', 'status', 'created_at', 'updated_at']).execute()
  const registered = new Map(getRegisteredApps().map(a => [a.id, a]))

  return {
    apps: rows.map((r) => {
      const reg = registered.get(r.id)
      return {
        id: r.id,
        title: reg?.title ?? r.id,
        description: reg?.description,
        icon: reg?.icon,
        status: r.status,
        installed: !!reg,
        created_at: r.created_at,
        updated_at: r.updated_at
      }
    })
  }
})
