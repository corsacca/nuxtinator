import { db } from '#core/server/utils/database'
import { requireAuth } from '#core/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Columns are global and shared; any authenticated user can list them.
  // Bypass `defineTenantHandler` because columns has no `org_id` and we
  // don't need a tenant context just to read this global metadata.
  requireAuth(event)
  const rows = await db
    .selectFrom('columns')
    .selectAll()
    .orderBy('position', 'asc')
    .execute()
  return rows
})
