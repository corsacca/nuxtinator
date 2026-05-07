import { getRouterParam } from 'h3'
import { withOrgPermission } from '#tenant/server'
import { isRegisteredPermission } from '#core/server/utils/permissions-registry'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.roles.write', async (tx, ctx) => {
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

    const body = await readBody(event)
    const name = typeof body?.name === 'string' ? body.name.trim() : null
    const description = typeof body?.description === 'string' ? body.description.trim() : null
    const inputPerms = Array.isArray(body?.permissions) ? body.permissions : null

    const next: { updated: string, name?: string, description?: string, permissions?: string[] } = {
      updated: new Date().toISOString()
    }
    if (name !== null) {
      if (name.length < 2) throw createError({ statusCode: 400, statusMessage: 'Name must be at least 2 characters' })
      next.name = name
    }
    if (description !== null) next.description = description
    if (inputPerms) {
      const perms = Array.from(new Set(inputPerms.filter((p: unknown): p is string =>
        typeof p === 'string' && isRegisteredPermission(p)
      )))
      const missing = perms.filter(p => !ctx.perms.has(p as never))
      if (missing.length > 0) {
        throw createError({
          statusCode: 403,
          statusMessage: `Cannot grant permissions you don't hold: ${missing.join(', ')}`
        })
      }
      next.permissions = perms
    }

    try {
      const updated = await tx
        .updateTable('custom_roles')
        .set(next)
        .where('id', '=', id)
        .where('org_id', '=', ctx.orgId)
        .returning(['id', 'name', 'description', 'permissions'])
        .executeTakeFirst()
      if (!updated) throw createError({ statusCode: 404, statusMessage: 'Role not found' })
      return updated
    } catch (err: unknown) {
      if (err?.code === '23505') {
        throw createError({ statusCode: 409, statusMessage: 'A role with that name already exists in this org' })
      }
      throw err
    }
  })
})
