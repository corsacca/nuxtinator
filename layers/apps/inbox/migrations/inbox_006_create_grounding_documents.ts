import { type Kysely, sql } from 'kysely'

// Grounding documents: per-source snapshots of external reference content
// (synced CMS pages, docs) the AI drafter reads to ground org-specific facts.
// `source` + `doc_key` are both externally controlled (sync source ids + page
// slugs), so the unique is rescoped org-leading in inbox_T006 for multi mode.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('inbox_grounding_documents')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('source', 'varchar(32)', col => col.notNull())
    .addColumn('doc_key', 'varchar(128)', col => col.notNull())
    .addColumn('title', 'text')
    .addColumn('body_text', 'text', col => col.notNull())
    .addColumn('fetched_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()
  await sql`CREATE UNIQUE INDEX inbox_grounding_documents_source_doc_key_uniq ON inbox_grounding_documents (source, doc_key)`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('inbox_grounding_documents').execute()
}
