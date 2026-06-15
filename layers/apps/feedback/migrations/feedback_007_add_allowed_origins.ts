import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Origins (scheme + host + port) that may host the embeddable feedback widget
// for this project and complete the sign-in redirect flow. Empty by default —
// a project accepts no cross-origin sign-in until an operator adds origins.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('allowed_origins', sql`text[]`, col =>
      col.notNull().defaultTo(sql`'{}'::text[]`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .dropColumn('allowed_origins')
    .execute()
}
