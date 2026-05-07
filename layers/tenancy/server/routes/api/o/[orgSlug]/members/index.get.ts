import { withOrgPermission } from '#tenant/server'

// List members of the active org. Joins users (which is not RLS-scoped — it's
// global identity) with memberships (also not RLS-scoped). The where-clause
// on `org_id` is what scopes results.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.members.read', async (tx, ctx) => {
    const rows = await tx
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.user_id')
      .select([
        'memberships.id as membership_id',
        'memberships.user_id as user_id',
        'memberships.roles as roles',
        'memberships.created_at as joined_at',
        'users.email as email',
        'users.display_name as display_name',
        'users.verified as verified',
        'users.password as password',
        'users.token_expires_at as token_expires_at'
      ])
      .where('memberships.org_id', '=', ctx.orgId)
      .orderBy('users.display_name', 'asc')
      .execute()

    const now = Date.now()
    return {
      members: rows.map((r) => {
        let status: 'active' | 'not_verified' | 'pending_invite' | 'expired_invite'
        if (r.verified) status = 'active'
        else if (r.password !== null) status = 'not_verified'
        else {
          const expiresMs = r.token_expires_at ? new Date(r.token_expires_at).getTime() : 0
          status = expiresMs > now ? 'pending_invite' : 'expired_invite'
        }
        return {
          membership_id: r.membership_id,
          user_id: r.user_id,
          email: r.email,
          display_name: r.display_name,
          roles: r.roles,
          status,
          joined_at: r.joined_at
        }
      })
    }
  })
})
