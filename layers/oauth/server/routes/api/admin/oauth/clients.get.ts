// Admin: paginated list of registered OAuth clients with consent +
// active-family counts. Mirrors the consumer's
// /api/admin/users.get.ts pagination shape so the admin UI can
// reuse the same patterns.

import { sql } from 'kysely'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)

  const query = getQuery(event)

  const pageRaw = Number(query.page ?? 1)
  const pageSizeRaw = Number(query.pageSize ?? 50)
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 && pageSizeRaw <= 200
    ? Math.floor(pageSizeRaw)
    : 50

  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const pattern = q ? `%${q}%` : null

  const totalRow = await db
    .selectFrom('oauth_clients')
    .select(eb => eb.fn.countAll<string>().as('count'))
    .$if(!!pattern, qb => qb.where(eb => eb.or([
      eb('oauth_clients.client_name', 'ilike', pattern!),
      eb('oauth_clients.client_id', 'ilike', pattern!)
    ])))
    .executeTakeFirst()
  const total = Number(totalRow?.count ?? 0)

  const rows = await db
    .selectFrom('oauth_clients')
    .select([
      'oauth_clients.client_id',
      'oauth_clients.client_name',
      'oauth_clients.dynamic',
      'oauth_clients.enabled',
      'oauth_clients.scope',
      'oauth_clients.created',
      eb => eb
        .selectFrom('oauth_consents')
        .select(eb2 => eb2.fn.count<string>('oauth_consents.id').as('count'))
        .whereRef('oauth_consents.client_id', '=', 'oauth_clients.client_id')
        .where('oauth_consents.revoked', '=', false)
        .as('active_consents'),
      eb => eb
        .selectFrom('oauth_token_families')
        .select(eb2 => eb2.fn.count<string>('oauth_token_families.family_id').as('count'))
        .whereRef('oauth_token_families.client_id', '=', 'oauth_clients.client_id')
        .where('oauth_token_families.revoked', '=', false)
        .as('active_families')
    ])
    .$if(!!pattern, qb => qb.where(eb => eb.or([
      eb('oauth_clients.client_name', 'ilike', pattern!),
      eb('oauth_clients.client_id', 'ilike', pattern!)
    ])))
    .orderBy(sql`oauth_clients.created desc`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .execute()

  return {
    rows: rows.map(r => ({
      client_id: r.client_id,
      client_name: r.client_name,
      dynamic: r.dynamic,
      enabled: r.enabled,
      scope: r.scope,
      created: new Date(r.created as unknown as string).toISOString(),
      active_consents: Number(r.active_consents ?? 0),
      active_families: Number(r.active_families ?? 0)
    })),
    total,
    page,
    pageSize
  }
})
