import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Per-user digest opt-in for channels. Does NOT gate visibility or sidebar
  // badges — those are universal for org members. Only controls whether the
  // user is included in the daily digest's channel-activity summary.
  await db.schema
    .createTable('messages_channel_subscriptions')
    .addColumn('channel_id', 'uuid', col =>
      col.notNull().references('messages_conversations.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('subscribed_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('messages_channel_subscriptions_pk', ['channel_id', 'user_id'])
    .execute()

  await db.schema
    .createIndex('messages_channel_subscriptions_user_idx')
    .on('messages_channel_subscriptions')
    .column('user_id')
    .execute()

  // Per-(user, conversation) read pointer. Drives sidebar unread badges and
  // the daily digest's "X new in #channel" counts. Upserted when the user
  // opens a conversation or hits "mark read".
  await db.schema
    .createTable('messages_conversation_reads')
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('conversation_id', 'uuid', col =>
      col.notNull().references('messages_conversations.id').onDelete('cascade'))
    .addColumn('last_read_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('messages_conversation_reads_pk', ['user_id', 'conversation_id'])
    .execute()

  await db.schema
    .createIndex('messages_conversation_reads_conv_idx')
    .on('messages_conversation_reads')
    .column('conversation_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('messages_conversation_reads').execute()
  await db.schema.dropTable('messages_channel_subscriptions').execute()
}
