import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Denormalized mention rows. One row per (item-or-comment, mentioned_user).
  // Used to power "show me my mentions" without scanning every body_json.
  await db.schema
    .createTable('messages_mentions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('item_id', 'uuid', col =>
      col.references('messages_items.id').onDelete('cascade'))
    .addColumn('comment_id', 'uuid', col =>
      col.references('messages_comments.id').onDelete('cascade'))
    .addColumn('mentioned_user_id', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  // Exactly one of item_id / comment_id must be set.
  await sql`
    ALTER TABLE messages_mentions
      ADD CONSTRAINT messages_mentions_target_exactly_one
        CHECK ((item_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)
  `.execute(db)

  await db.schema
    .createIndex('messages_mentions_user_idx')
    .on('messages_mentions')
    .columns(['mentioned_user_id', 'created_at'])
    .execute()

  await db.schema
    .createIndex('messages_mentions_item_idx')
    .on('messages_mentions')
    .column('item_id')
    .execute()

  await db.schema
    .createIndex('messages_mentions_comment_idx')
    .on('messages_mentions')
    .column('comment_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('messages_mentions').execute()
}
