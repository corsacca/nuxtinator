import { sql, type Kysely } from 'kysely'

// The pages search surfaced for a reply (the auto-search on the visitor's
// message plus any `search` tool calls), `{ ref, title, url }[]` best-first.
// Most replies are grounded on these hits alone without a `load_page`, so
// without them the transcript can't show where an answer came from.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('helpinator_messages')
    .addColumn('search_hits', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('helpinator_messages').dropColumn('search_hits').execute()
}
