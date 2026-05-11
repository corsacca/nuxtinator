import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'
import { getApps } from '../../../utils/app-settings'

// Host admin: every registered app (registry-first), with its current DB
// status merged in. Orphan rows (DB row, no registered layer) are
// appended with `installed: false` so they can be purged.
export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)
  const apps = await getApps(db)
  return { apps }
})
