import { sql } from 'kysely'
import { defineTenantHandler } from '#tenant/server'

export default defineTenantHandler(async (tx, _ctx) => {
  const rows = await tx
    .selectFrom('projects')
    .selectAll()
    .orderBy(sql`coalesce((post_meta->>'sort_order')::int, 9999)`)
    .orderBy('created_at')
    .execute()

  return rows
})
