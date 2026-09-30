import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// Widgets bind to a list of libraries (one of them the default) instead of a
// single portfolio. The widgets that exist at this point are test rows from
// the single-portfolio phase; they are dropped rather than migrated (their
// conversations cascade). Conversations snapshot the widget's library set so
// a rebound widget ends its old conversations. Messages record the pages the
// bot read (`pages_loaded`, `{ ref, title }[]`) and the searches it ran.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM helpinator_widgets`.execute(db)

  await db.schema.alterTable('helpinator_widgets').dropColumn('portfolio_id').execute()
  await db.schema
    .alterTable('helpinator_widgets')
    .addColumn('library_ids', sql`uuid[]`, col => col.notNull().defaultTo(sql`'{}'::uuid[]`))
    .addColumn('default_library_id', 'uuid')
    .execute()
  await sql`ALTER TABLE helpinator_widgets ALTER COLUMN default_section_key DROP NOT NULL`.execute(db)

  await db.schema.alterTable('helpinator_conversations').dropColumn('portfolio_id').execute()
  await db.schema
    .alterTable('helpinator_conversations')
    .addColumn('library_ids', sql`uuid[]`, col => col.notNull().defaultTo(sql`'{}'::uuid[]`))
    .addColumn('default_library_id', 'uuid')
    .execute()

  await sql`ALTER TABLE helpinator_messages RENAME COLUMN sections_loaded TO pages_loaded`.execute(db)
  await db.schema
    .alterTable('helpinator_messages')
    .addColumn('searches', 'jsonb', col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('helpinator_messages').dropColumn('searches').execute()
  await sql`ALTER TABLE helpinator_messages RENAME COLUMN pages_loaded TO sections_loaded`.execute(db)
  await db.schema.alterTable('helpinator_conversations').dropColumn('default_library_id').dropColumn('library_ids').execute()
  await db.schema.alterTable('helpinator_conversations').addColumn('portfolio_id', 'uuid', col => col.notNull().defaultTo(sql`gen_random_uuid()`)).execute()
  await sql`DELETE FROM helpinator_widgets`.execute(db)
  await db.schema.alterTable('helpinator_widgets').dropColumn('default_library_id').dropColumn('library_ids').execute()
  await db.schema.alterTable('helpinator_widgets').addColumn('portfolio_id', 'uuid', col => col.references('context_portfolios.id').onDelete('set null')).execute()
  await sql`ALTER TABLE helpinator_widgets ALTER COLUMN default_section_key SET NOT NULL`.execute(db)
}
