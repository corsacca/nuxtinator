import { requireAuth } from '#core/server/utils/auth'
import { db } from '#core/server/utils/database'

// List the current user's memberships, with the org name/slug/suspended
// state joined in. `memberships` and `orgs` are not RLS-protected — auth is
// handled in code (the `where('user_id', '=', authUser.userId)` predicate
// scopes the result to the caller).
export default defineEventHandler(async (event) => {
  const authUser = requireAuth(event)

  const rows = await db
    .selectFrom('memberships')
    .innerJoin('orgs', 'orgs.id', 'memberships.org_id')
    .select([
      'orgs.id as id',
      'orgs.slug as slug',
      'orgs.name as name',
      'orgs.suspended_at as suspended_at',
      'memberships.roles as roles',
      'memberships.created_at as joined_at'
    ])
    .where('memberships.user_id', '=', authUser.userId)
    .orderBy('orgs.name', 'asc')
    .execute()

  return {
    orgs: rows.map(r => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      suspended: !!r.suspended_at,
      roles: r.roles,
      joined_at: r.joined_at
    }))
  }
})
