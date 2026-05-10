import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('messages_items')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('conversation_id', 'uuid', col =>
      col.notNull().references('messages_conversations.id').onDelete('cascade'))
    .addColumn('author_id', 'uuid', col => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('kind', 'text', col => col.notNull().check(sql`kind IN ('markdown', 'image', 'file')`))
    // body_json: the canonical TipTap ProseMirror doc, only set for kind='markdown'
    .addColumn('body_json', 'jsonb')
    // body_text: plaintext derived from body_json (or filename for non-markdown).
    // Application writes this on every save; used for FTS and previews.
    .addColumn('body_text', 'text')
    // Storage fields for kind='image'|'file'
    .addColumn('storage_key', 'text')
    .addColumn('filename', 'text')
    .addColumn('mime', 'text')
    .addColumn('size_bytes', 'bigint')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('edited_at', 'timestamptz')
    .addColumn('deleted_at', 'timestamptz')
    .execute()

  await db.schema
    .createIndex('messages_items_conv_created_idx')
    .on('messages_items')
    .columns(['conversation_id', 'created_at'])
    .execute()

  await db.schema
    .createIndex('messages_items_author_idx')
    .on('messages_items')
    .column('author_id')
    .execute()

  // tsvector for full-text search, generated from body_text.
  await sql`
    ALTER TABLE messages_items
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_text, ''))) STORED
  `.execute(db)

  await sql`CREATE INDEX messages_items_body_tsv_idx ON messages_items USING gin(body_tsv)`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('messages_items').execute()
}
