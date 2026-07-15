// GET /api/crm/users?q=&limit=
// User directory for user_select pickers and assignment filters. In
// multi-tenant mode it lists the active org's members; in single mode all
// users. Returns { items: [{ id, name, email, avatarUrl }] } ordered by
// name. Permission: crm.access.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Query = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'crm' }, 'crm.access', async (tx, ctx) => {
    const parsed = Query.safeParse(getQuery(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid query', data: parsed.error.flatten() })
    }
    const q = parsed.data.q?.trim().toLowerCase() ?? ''
    const limit = parsed.data.limit ?? 20

    let qb = tx
      .selectFrom('users')
      .select(['users.id', 'users.display_name', 'users.email', 'users.avatar'])

    // Org scoping only exists in multi mode; single mode has no memberships.
    if (ctx.orgId) {
      const orgId = ctx.orgId
      qb = qb.where(eb => eb.exists(
        eb.selectFrom('memberships')
          .select('memberships.user_id')
          .whereRef('memberships.user_id', '=', 'users.id')
          .where('memberships.org_id', '=', orgId)
      ))
    }

    if (q) {
      qb = qb.where(eb => eb.or([
        eb(eb.fn('lower', ['users.display_name']), 'like', `%${q}%`),
        eb(eb.fn('lower', ['users.email']), 'like', `%${q}%`)
      ]))
    }

    const rows = await qb
      .orderBy('users.display_name', 'asc')
      .limit(limit)
      .execute()

    return {
      items: rows.map(r => ({
        id: r.id,
        name: r.display_name,
        email: r.email,
        avatarUrl: r.avatar || null
      }))
    }
  })
})
