import { randomUUID } from 'node:crypto'
import { getRouterParam } from 'h3'
import { adminDb as db } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'
import { isRegisteredPermission } from '#core/server/utils/permissions-registry'
import { logEvent } from '#core/server/utils/activity-logger'

// Host-admin parallel for `POST /api/o/:orgSlug/roles`. No subset-delegation:
// host admin has god-mode and can grant any registered permission to any role
// in any org (per Phase 4.1's host-admin policy).
export default defineEventHandler(async (event) => {
  const { userId } = await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'orgId required' })

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

  const perms = Array.from(new Set(inputPerms.filter((p: unknown): p is string =>
    typeof p === 'string' && isRegisteredPermission(p)
  )))

  const id = randomUUID()
  const now = new Date().toISOString()

  try {
    await db
      .insertInto('custom_roles')
      .values({
        id,
        org_id: orgId,
        name,
        description,
        permissions: perms,
        created: now,
        updated: now
      })
      .execute()
  } catch (err: unknown) {
    if (err?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'A role with that name already exists in this org' })
    }
    throw err
  }

  logEvent({
    eventType: 'custom_role_created',
    userId,
    metadata: { orgId, name, permissions: perms, via: 'host_admin' },
    orgId
  }).catch(() => {})

  return { id, name, description, permissions: perms }
})
