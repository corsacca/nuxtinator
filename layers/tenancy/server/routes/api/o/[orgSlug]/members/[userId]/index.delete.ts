import { getRouterParam } from 'h3'
import { withOrgPermission } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'

// Remove a user from this org. Last-admin protection mirrors the role-edit
// path: an org must always have at least one admin.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.members.remove', async (tx, ctx) => {
    const targetUserId = getRouterParam(event, 'userId')
    if (!targetUserId) {
      throw createError({ statusCode: 400, statusMessage: 'userId required' })
    }

    const existing = await tx
      .selectFrom('memberships')
      .select(['id', 'roles'])
      .where('user_id', '=', targetUserId)
      .where('org_id', '=', ctx.orgId)
      .executeTakeFirst()

    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Membership not found' })
    }

    if (existing.roles.includes('admin')) {
      const adminCountRow = await tx
        .selectFrom('memberships')
        .select(eb => eb.fn.count<string>('id').as('count'))
        .where('org_id', '=', ctx.orgId)
        .where(eb => eb('roles', '@>', ['admin']))
        .executeTakeFirst()
      const adminCount = Number(adminCountRow?.count ?? 0)
      if (adminCount <= 1) {
        throw createError({ statusCode: 409, statusMessage: 'Cannot remove the last admin' })
      }
    }

    await tx
      .deleteFrom('memberships')
      .where('id', '=', existing.id)
      .execute()

    const nitro = useNitroApp()
    try {
      await nitro.hooks.callHook('membership.deleted', {
        membershipId: existing.id,
        userId: targetUserId,
        orgId: ctx.orgId
      })
    } catch (err) {
      console.warn('[hook membership.deleted] handler threw:', err)
    }

    logEvent({
      eventType: 'org_member_removed',
      userId: ctx.userId,
      metadata: { orgId: ctx.orgId, targetUserId, oldRoles: existing.roles }
    }).catch(() => {})

    return { success: true }
  })
})
