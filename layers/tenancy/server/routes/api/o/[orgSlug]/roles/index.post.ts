import { randomUUID } from 'node:crypto'
import { withOrgPermission } from '#tenant/server'
import { isRegisteredPermission } from '#core/server/utils/permissions-registry'
import { logEvent } from '#core/server/utils/activity-logger'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.roles.write', async (tx, ctx) => {
    const body = await readBody(event)
    const name = (body?.name ?? '').trim()
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const inputPerms = Array.isArray(body?.permissions) ? body.permissions : null

    if (name.length < 2) {
      throw createError({ statusCode: 400, statusMessage: 'Name must be at least 2 characters' })
    }
    if (!inputPerms) {
      throw createError({ statusCode: 400, statusMessage: 'permissions array required' })
    }

    const perms: string[] = Array.from(new Set<string>(inputPerms.filter((p: unknown): p is string =>
      typeof p === 'string' && isRegisteredPermission(p)
    )))

    // Subset-delegation: a role can't grant a permission the creator doesn't hold.
    const missing = perms.filter(p => !ctx.perms.has(p as never))
    if (missing.length > 0) {
      throw createError({
        statusCode: 403,
        statusMessage: `Cannot grant permissions you don't hold: ${missing.join(', ')}`
      })
    }

    const id = randomUUID()
    const now = new Date().toISOString()

    try {
      await tx
        .insertInto('custom_roles')
        .values({
          id,
          org_id: ctx.orgId,
          name,
          description,
          permissions: perms,
          created: now,
          updated: now
        })
        .execute()
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        throw createError({ statusCode: 409, statusMessage: 'A role with that name already exists in this org' })
      }
      throw err
    }

    logEvent({
      eventType: 'custom_role_created',
      userId: ctx.userId,
      metadata: { orgId: ctx.orgId, name, permissions: perms }
    }).catch(() => {})

    return { id, name, description, permissions: perms }
  })
})
