// Admin: paginated list of active (non-revoked) OAuth token
// families. Each family represents one user × client × auth event,
// and revoking it kills all access + refresh tokens it issued.
//
// Joined to users.email + oauth_clients.client_name + a max-of
// last_used across the family's access tokens so admins can spot
// stale grants and zombie clients at a glance.

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
    .selectFrom('oauth_token_families')
    .leftJoin('users', 'users.id', 'oauth_token_families.user_id')
    .leftJoin('oauth_clients', 'oauth_clients.client_id', 'oauth_token_families.client_id')
    .select(eb => eb.fn.countAll<string>().as('count'))
    .where('oauth_token_families.revoked', '=', false)
    .$if(!!pattern, qb => qb.where(eb => eb.or([
      eb('users.email', 'ilike', pattern!),
      eb('oauth_clients.client_name', 'ilike', pattern!)
    ])))
    .executeTakeFirst()
  const total = Number(totalRow?.count ?? 0)

  const rows = await db
    .selectFrom('oauth_token_families')
    .leftJoin('users', 'users.id', 'oauth_token_families.user_id')
    .leftJoin('oauth_clients', 'oauth_clients.client_id', 'oauth_token_families.client_id')
    .select([
      'oauth_token_families.family_id',
      'oauth_token_families.user_id',
      'oauth_token_families.client_id',
      'oauth_token_families.created',
      'users.email as user_email',
      'oauth_clients.client_name',
      eb => eb
        .selectFrom('oauth_access_tokens')
        .select(eb2 => eb2.fn.max('oauth_access_tokens.last_used').as('last_used'))
        .whereRef('oauth_access_tokens.family_id', '=', 'oauth_token_families.family_id')
        .as('last_used_at'),
      eb => eb
        .selectFrom('oauth_access_tokens')
        .select(eb2 => eb2.fn.count<string>('oauth_access_tokens.token_hash').as('count'))
        .whereRef('oauth_access_tokens.family_id', '=', 'oauth_token_families.family_id')
        .where('oauth_access_tokens.revoked', '=', false)
        .as('access_token_count'),
      eb => eb
        .selectFrom('oauth_refresh_tokens')
        .select(eb2 => eb2.fn.count<string>('oauth_refresh_tokens.token_hash').as('count'))
        .whereRef('oauth_refresh_tokens.family_id', '=', 'oauth_token_families.family_id')
        .where('oauth_refresh_tokens.revoked', '=', false)
        .as('refresh_token_count')
    ])
    .where('oauth_token_families.revoked', '=', false)
    .$if(!!pattern, qb => qb.where(eb => eb.or([
      eb('users.email', 'ilike', pattern!),
      eb('oauth_clients.client_name', 'ilike', pattern!)
    ])))
    .orderBy(sql`oauth_token_families.created desc`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .execute()

  return {
    rows: rows.map(r => ({
      family_id: r.family_id,
      user_id: r.user_id,
      user_email: r.user_email,
      client_id: r.client_id,
      client_name: r.client_name,
      created: new Date(r.created as unknown as string).toISOString(),
      last_used_at: r.last_used_at ? new Date(r.last_used_at as unknown as string).toISOString() : null,
      access_token_count: Number(r.access_token_count ?? 0),
      refresh_token_count: Number(r.refresh_token_count ?? 0)
    })),
    total,
    page,
    pageSize
  }
})
