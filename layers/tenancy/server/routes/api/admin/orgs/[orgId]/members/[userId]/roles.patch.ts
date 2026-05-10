import { getRouterParam } from 'h3'
import { adminDb as db } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'
import { validateRoleNames } from '#core/server/utils/rbac'

// Host-admin variant of role assignment. No subset-delegation check — host
// admin has god-mode by definition. Last-admin protection still applies.
export default defineEventHandler(async (event) => {
  await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  const targetUserId = getRouterParam(event, 'userId')
  if (!orgId || !targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'orgId and userId required' })
  }

  const body = await readBody(event)
  const inputRoles = Array.isArray(body?.roles) ? body.roles : null
  if (!inputRoles || inputRoles.some((r: unknown) => typeof r !== 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'roles must be an array of strings' })
  }
  const newRoles = Array.from(new Set(inputRoles as string[]))

  const { valid, unknown } = await validateRoleNames(db, newRoles)
  if (!valid) {
    throw createError({ statusCode: 400, statusMessage: `Unknown role(s): ${unknown.join(', ')}` })
  }

  const existing = await db
    .selectFrom('memberships')
    .select(['id', 'roles'])
    .where('user_id', '=', targetUserId)
    .where('org_id', '=', orgId)
    .executeTakeFirst()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Membership not found' })

  if (existing.roles.includes('admin') && !newRoles.includes('admin')) {
    const adminCountRow = await db
      .selectFrom('memberships')
      .select(eb => eb.fn.count<string>('id').as('count'))
      .where('org_id', '=', orgId)
      .where(eb => eb('roles', '@>', ['admin']))
      .executeTakeFirst()
    if (Number(adminCountRow?.count ?? 0) <= 1) {
      throw createError({ statusCode: 409, statusMessage: 'Cannot remove the last admin' })
    }
  }

  await db
    .updateTable('memberships')
    .set({ roles: newRoles, updated_at: new Date().toISOString() })
    .where('id', '=', existing.id)
    .execute()

  const nitro = useNitroApp()
  try {
    await nitro.hooks.callHook('membership.updated', {
      membershipId: existing.id,
      userId: targetUserId,
      orgId,
      oldRoles: existing.roles,
      newRoles
    })
  } catch (err) {
    console.warn('[hook membership.updated] handler threw:', err)
  }

  return { user_id: targetUserId, roles: newRoles }
})
