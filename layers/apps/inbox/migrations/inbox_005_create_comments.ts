import { type Kysely, sql } from 'kysely'

// Internal notes on a conversation — private staff commentary, never emailed to
// the contact. Plain text (same shape as crm_record_comments), rendered
// whitespace-preserving on the client; teammate notifications ride an explicit
// mention id list from the composer, not parsed out of the body. `author_id` is
// SET NULL with `author_label` carrying a display name for system notes (null
// author, never editable). `edited_at` is NULL until the first edit (the
// "(edited)" marker). Notes CASCADE with the conversation.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('inbox_comments')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('conversation_id', 'uuid', col => col.notNull().references('inbox_conversations.id').onDelete('cascade'))
    .addColumn('author_id', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('author_label', 'text')
    .addColumn('body', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('edited_at', 'timestamptz')
    .execute()

  // Backs the newest-first keyset scan (created_at, id) < cursor.
  await sql`
    CREATE INDEX inbox_comments_conversation_idx
      ON inbox_comments (conversation_id, created_at DESC, id DESC)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('inbox_comments').execute()
}
