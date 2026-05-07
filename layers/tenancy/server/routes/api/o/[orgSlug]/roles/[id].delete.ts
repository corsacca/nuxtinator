import { getRouterParam } from 'h3'
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.roles.delete', async (tx, ctx) => {
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

    const role = await tx
      .selectFrom('custom_roles')
      .select(['id', 'name'])
      .where('id', '=', id)
      .where('org_id', '=', ctx.orgId)
      .executeTakeFirst()
    if (!role) throw createError({ statusCode: 404, statusMessage: 'Role not found' })

    // Memberships that referenced this role will silently lose it on next
    // perm-resolution (the orphan-filter via `isRegisteredPermission`). The
    // membership rows themselves don't need rewriting.
    await tx
      .deleteFrom('custom_roles')
      .where('id', '=', id)
      .where('org_id', '=', ctx.orgId)
      .execute()

    return { success: true }
  })
})
