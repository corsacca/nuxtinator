import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('messages_conversations')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('kind', 'text', col => col.notNull().check(sql`kind IN ('channel', 'dm')`))
    .addColumn('name', 'text')
    .addColumn('description', 'text')
    .addColumn('created_by', 'uuid', col => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('archived_at', 'timestamptz')
    // Sorted user-pair for 1:1 DM dedupe. Set only when creating a 1:1 DM.
    .addColumn('dm_pair_lo', 'uuid')
    .addColumn('dm_pair_hi', 'uuid')
    .execute()

  await db.schema
    .createIndex('messages_conversations_kind_idx')
    .on('messages_conversations')
    .column('kind')
    .execute()

  // 1:1 DM dedupe: any kind='dm' with dm_pair_lo set must be unique on the pair.
  await sql`
    CREATE UNIQUE INDEX messages_conversations_dm_pair_uniq
      ON messages_conversations (dm_pair_lo, dm_pair_hi)
      WHERE kind = 'dm' AND dm_pair_lo IS NOT NULL
  `.execute(db)

  await db.schema
    .createTable('messages_conversation_members')
    .addColumn('conversation_id', 'uuid', col =>
      col.notNull().references('messages_conversations.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('role', 'text', col => col.notNull().defaultTo('member'))
    .addColumn('joined_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('messages_conversation_members_pk', ['conversation_id', 'user_id'])
    .execute()

  await db.schema
    .createIndex('messages_conversation_members_user_idx')
    .on('messages_conversation_members')
    .column('user_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('messages_conversation_members').execute()
  await db.schema.dropTable('messages_conversations').execute()
}
