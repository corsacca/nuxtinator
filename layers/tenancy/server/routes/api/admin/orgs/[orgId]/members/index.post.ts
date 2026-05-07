import { randomUUID } from 'node:crypto'
import { getRouterParam } from 'h3'
import { adminDb as db } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'
import { validateRoleNames } from '#core/server/utils/rbac'
import { logEvent } from '#core/server/utils/activity-logger'

// Host admin attaches an existing user to an org. No email is sent — silent
// attach. (Phase 4.1 covers the multi-org invite flow that also creates new
// users.)
export default defineEventHandler(async (event) => {
  const { userId: hostAdminId } = await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'orgId required' })

  const body = await readBody(event)
  const targetUserId: string = body?.userId
  const inputRoles = Array.isArray(body?.roles) ? body.roles : null

  if (!targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'userId required' })
  }
  if (!inputRoles || inputRoles.some((r: unknown) => typeof r !== 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'roles must be an array of strings' })
  }

  const roles = Array.from(new Set(inputRoles as string[]))
  const { valid, unknown } = await validateRoleNames(db, roles, orgId)
  if (!valid) {
    throw createError({ statusCode: 400, statusMessage: `Unknown role(s): ${unknown.join(', ')}` })
  }

  const target = await db
    .selectFrom('users')
    .select('id')
    .where('id', '=', targetUserId)
    .executeTakeFirst()
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const existing = await db
    .selectFrom('memberships')
    .select('id')
    .where('user_id', '=', targetUserId)
    .where('org_id', '=', orgId)
    .executeTakeFirst()
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'User is already a member of this org' })
  }

  const membershipId = randomUUID()
  const now = new Date().toISOString()
  await db
    .insertInto('memberships')
    .values({
      id: membershipId,
      user_id: targetUserId,
      org_id: orgId,
      roles,
      created_at: now,
      updated_at: now
    })
    .execute()

  const nitro = useNitroApp()
  try {
    await nitro.hooks.callHook('membership.created', {
      membershipId,
      userId: targetUserId,
      orgId,
      roles,
      createdByUserId: hostAdminId
    })
  } catch (err) {
    console.warn('[hook membership.created] handler threw:', err)
  }

  logEvent({
    eventType: 'admin_member_attached',
    userId: hostAdminId,
    metadata: { orgId, targetUserId, roles }
  }).catch(() => {})

  return { membershipId, user_id: targetUserId, roles }
})
