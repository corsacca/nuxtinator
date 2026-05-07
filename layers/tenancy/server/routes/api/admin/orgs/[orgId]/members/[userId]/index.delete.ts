import { getRouterParam } from 'h3'
import { adminDb as db } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'

export default defineEventHandler(async (event) => {
  await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  const targetUserId = getRouterParam(event, 'userId')
  if (!orgId || !targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'orgId and userId required' })
  }

  const existing = await db
    .selectFrom('memberships')
    .select(['id', 'roles'])
    .where('user_id', '=', targetUserId)
    .where('org_id', '=', orgId)
    .executeTakeFirst()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Membership not found' })

  if (existing.roles.includes('admin')) {
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

  await db.deleteFrom('memberships').where('id', '=', existing.id).execute()

  const nitro = useNitroApp()
  try {
    await nitro.hooks.callHook('membership.deleted', {
      membershipId: existing.id,
      userId: targetUserId,
      orgId
    })
  } catch (err) {
    console.warn('[hook membership.deleted] handler threw:', err)
  }

  return { success: true }
})
