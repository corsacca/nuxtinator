import { getRouterParam } from 'h3'
import { sql } from 'kysely'
import { withOrgPermission, computePermsForOrg } from '#tenant/server'
import { validateRoleNames, getRolePermissions } from '#core/server/utils/rbac'
import { logEvent } from '#core/server/utils/activity-logger'

// Update a member's roles inside this org.
//
// Subset-delegation: the editor cannot grant a role whose effective permission
// set includes a permission they don't currently hold in this org. The set
// being assigned is computed for *the target's org context* (since custom
// roles + overrides are per-org).
//
// Last-admin protection: if dropping the `admin` role would leave the org
// with zero admins, return 409.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.members.manage_roles', async (tx, ctx) => {
    const targetUserId = getRouterParam(event, 'userId')
    if (!targetUserId) {
      throw createError({ statusCode: 400, statusMessage: 'userId required' })
    }
    const body = await readBody(event)
    const inputRoles = Array.isArray(body?.roles) ? body.roles : null
    if (!inputRoles || inputRoles.some((r: unknown) => typeof r !== 'string')) {
      throw createError({ statusCode: 400, statusMessage: 'roles must be an array of strings' })
    }

    const newRoles = Array.from(new Set(inputRoles as string[]))

    const { valid, unknown } = await validateRoleNames(tx, newRoles)
    if (!valid) {
      throw createError({ statusCode: 400, statusMessage: `Unknown role(s): ${unknown.join(', ')}` })
    }

    // Subset-delegation: every permission the new role-set grants must be
    // covered by the editor's current org perm set.
    const newRolePerms = await getRolePermissions(tx, newRoles, ctx.orgId)
    const missing = [...newRolePerms].filter(p => !ctx.perms.has(p))
    if (missing.length > 0) {
      throw createError({
        statusCode: 403,
        statusMessage: `Cannot assign roles granting permissions you don't hold: ${missing.join(', ')}`
      })
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

    const oldRoles = existing.roles
    const wasAdmin = oldRoles.includes('admin')
    const willBeAdmin = newRoles.includes('admin')

    if (wasAdmin && !willBeAdmin) {
      // Raw SQL for `@>` — Kysely's binary builder mis-encodes a JS array
      // as a single string, producing "malformed array literal".
      const adminCountRow = await tx
        .selectFrom('memberships')
        .select(eb => eb.fn.count<string>('id').as('count'))
        .where('org_id', '=', ctx.orgId)
        .where(sql<boolean>`roles @> ARRAY['admin']::text[]`)
        .executeTakeFirst()
      const adminCount = Number(adminCountRow?.count ?? 0)
      if (adminCount <= 1) {
        throw createError({ statusCode: 409, statusMessage: 'Cannot remove the last admin' })
      }
    }

    await tx
      .updateTable('memberships')
      .set({ roles: newRoles, updated_at: new Date().toISOString() })
      .where('id', '=', existing.id)
      .execute()

    const nitro = useNitroApp()
    try {
      await nitro.hooks.callHook('membership.updated', {
        membershipId: existing.id,
        userId: targetUserId,
        orgId: ctx.orgId,
        oldRoles,
        newRoles
      })
    } catch (err) {
      console.warn('[hook membership.updated] handler threw:', err)
    }

    logEvent({
      eventType: 'org_member_roles_updated',
      userId: ctx.userId,
      metadata: { orgId: ctx.orgId, targetUserId, oldRoles, newRoles }
    }, tx).catch(() => {})

    // Recompute the target's effective perms to mirror back, useful for UI.
    const targetPerms = await computePermsForOrg(tx, targetUserId, ctx.orgId)

    return {
      user_id: targetUserId,
      roles: newRoles,
      permissions: [...targetPerms]
    }
  })
})
