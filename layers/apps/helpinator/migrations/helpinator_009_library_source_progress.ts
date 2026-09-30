import type { Kysely } from 'kysely'

// Live crawl progress for a URL entry: `run_total` is how many URLs the
// current run planned to fetch (set once discovery is done), `run_done` how
// many it has worked through so far (indexed, skipped or failed). Both reset
// when a run starts; `page_count` / `bytes` stay the last finished run's.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('helpinator_library_sources')
    .addColumn('run_total', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('run_done', 'integer', col => col.notNull().defaultTo(0))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('helpinator_library_sources')
    .dropColumn('run_total')
    .dropColumn('run_done')
    .execute()
}
