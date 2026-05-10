import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Targeted notifications only. No `channel_post` kind — channel-post unread
  // is derived from messages_conversation_reads instead.
  await db.schema
    .createTable('messages_notifications')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('kind', 'text', col =>
      col.notNull().check(sql`kind IN ('mention', 'dm', 'comment', 'reply')`))
    .addColumn('item_id', 'uuid', col =>
      col.references('messages_items.id').onDelete('cascade'))
    .addColumn('comment_id', 'uuid', col =>
      col.references('messages_comments.id').onDelete('cascade'))
    .addColumn('conversation_id', 'uuid', col =>
      col.references('messages_conversations.id').onDelete('cascade'))
    .addColumn('actor_id', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('read_at', 'timestamptz')
    .addColumn('emailed_at', 'timestamptz')
    .execute()

  // Unread feed lookup
  await db.schema
    .createIndex('messages_notifications_user_unread_idx')
    .on('messages_notifications')
    .columns(['user_id', 'read_at', 'created_at'])
    .execute()

  // Digest scan: not yet emailed, not yet read, not a per-event kind
  await sql`
    CREATE INDEX messages_notifications_digest_pending_idx
      ON messages_notifications (user_id, created_at)
      WHERE emailed_at IS NULL AND read_at IS NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('messages_notifications').execute()
}
