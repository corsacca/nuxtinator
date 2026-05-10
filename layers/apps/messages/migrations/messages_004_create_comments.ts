import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('messages_comments')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('item_id', 'uuid', col =>
      col.notNull().references('messages_items.id').onDelete('cascade'))
    .addColumn('author_id', 'uuid', col => col.notNull().references('users.id').onDelete('restrict'))
    // parent_comment_id: when set, this is a reply to a top-level comment.
    // Application enforces depth = 1 (parent must itself have parent_comment_id IS NULL).
    .addColumn('parent_comment_id', 'uuid', col =>
      col.references('messages_comments.id').onDelete('cascade'))
    .addColumn('body_json', 'jsonb', col => col.notNull())
    .addColumn('body_text', 'text', col => col.notNull())
    // Hypothesis-style highlight anchor: { quote, prefix, suffix, start, end }.
    // Set only for top-level comments anchored to a markdown item span.
    .addColumn('anchor', 'jsonb')
    .addColumn('anchor_orphaned', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('edited_at', 'timestamptz')
    .addColumn('deleted_at', 'timestamptz')
    .execute()

  await db.schema
    .createIndex('messages_comments_item_idx')
    .on('messages_comments')
    .columns(['item_id', 'created_at'])
    .execute()

  await db.schema
    .createIndex('messages_comments_parent_idx')
    .on('messages_comments')
    .column('parent_comment_id')
    .execute()

  await db.schema
    .createIndex('messages_comments_author_idx')
    .on('messages_comments')
    .column('author_id')
    .execute()

  await sql`
    ALTER TABLE messages_comments
    ADD COLUMN body_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(body_text, ''))) STORED
  `.execute(db)

  await sql`CREATE INDEX messages_comments_body_tsv_idx ON messages_comments USING gin(body_tsv)`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('messages_comments').execute()
}
