// GET /api/context/portfolios — list portfolios in the active org.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.read', async (tx) => {
    const rows = await tx
      .selectFrom('context_portfolios')
      .select(['id', 'slug', 'name', 'color', 'icon_url', 'created_at', 'updated_at'])
      .orderBy('name', 'asc')
      .execute()
    return { portfolios: rows }
  })
})
