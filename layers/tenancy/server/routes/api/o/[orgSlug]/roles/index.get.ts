import { withOrgPermission } from '#tenant/server'

// List per-org custom roles. RLS scopes to the active org automatically;
// the explicit `where('org_id', ...)` is redundant but cheap.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.roles.read', async (tx, ctx) => {
    const rows = await tx
      .selectFrom('custom_roles')
      .select(['id', 'name', 'description', 'permissions', 'created', 'updated'])
      .where('org_id', '=', ctx.orgId)
      .orderBy('name', 'asc')
      .execute()
    return { roles: rows }
  })
})
