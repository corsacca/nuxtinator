// GET /api/files/search?q=...&limit=
// Postgres FTS over files_items.body_tsv (title + filename + body + tags),
// scoped by RLS to this org. Binary file contents are not indexed.

import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'

const MAX_LIMIT = 50

// HTML-escape the body BEFORE ts_headline (which only injects <b>...</b> and
// does not escape its input) so a doc containing markup can't round-trip live
// HTML into the client's v-html. Same pattern as the messages search route.
const ESCAPED_BODY = sql<string>`
  replace(
    replace(
      replace(
        replace(
          replace(coalesce(f.body_md, f.title), '&', '&amp;'),
          '<', '&lt;'),
        '>', '&gt;'),
      '"', '&quot;'),
    '''', '&#39;')
`

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.read', async (tx) => {
    const q = getQuery(event)
    const query = typeof q.q === 'string' ? q.q.trim() : ''
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || 20))
    if (!query) return { items: [] }

    const tsQuery = sql<unknown>`websearch_to_tsquery('english', ${query})`

    const rows = await tx
      .selectFrom('files_items as f')
      .leftJoin('users as u', 'u.id', 'f.created_by')
      .select([
        'f.id',
        'f.kind',
        'f.title',
        'f.filename',
        'f.mime',
        'f.tags',
        'f.created_at',
        'u.display_name as created_by_name',
        sql<string>`ts_headline('english', ${ESCAPED_BODY}, ${tsQuery}, 'MaxWords=30,MinWords=10')`.as('headline')
      ])
      .where('f.deleted_at', 'is', null)
      .where(sql<boolean>`f.body_tsv @@ ${tsQuery}`)
      .orderBy(sql`ts_rank(f.body_tsv, ${tsQuery})`, 'desc')
      .limit(limit)
      .execute()

    return { items: rows }
  })
})
