import { type Kysely, sql } from 'kysely'

// Knowledge base: anonymised Q&A entries grown from resolved threads; the AI
// drafter reads active entries as reference. source_conversation_id is nullable
// + SET NULL so an entry outlives the thread it came from; created_by SET NULL
// so it survives the teammate who captured it. status is a zod-owned open
// vocabulary (active|archived) — no CHECK, matching the inbox house style. No
// unique to rescope, so inbox_T007 only adds org_id + RLS.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('inbox_knowledge_entries')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('question', 'text', col => col.notNull())
    .addColumn('answer', 'text', col => col.notNull())
    .addColumn('language', 'varchar(8)', col => col.notNull().defaultTo('en'))
    .addColumn('source_conversation_id', 'uuid', col => col.references('inbox_conversations.id').onDelete('set null'))
    .addColumn('status', 'text', col => col.notNull().defaultTo('active'))
    .addColumn('created_by', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()
  await sql`CREATE INDEX inbox_knowledge_entries_status_idx ON inbox_knowledge_entries (status)`.execute(db)
  // Index the SET-NULL FK so a conversation delete doesn't seq-scan the table.
  await sql`CREATE INDEX inbox_knowledge_entries_source_conversation_idx ON inbox_knowledge_entries (source_conversation_id)`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('inbox_knowledge_entries').execute()
}
