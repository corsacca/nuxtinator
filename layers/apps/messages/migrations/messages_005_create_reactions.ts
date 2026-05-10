import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('messages_reactions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('target_kind', 'text', col =>
      col.notNull().check(sql`target_kind IN ('item', 'comment')`))
    .addColumn('target_id', 'uuid', col => col.notNull())
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('emoji', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('messages_reactions_unique', ['target_kind', 'target_id', 'user_id', 'emoji'])
    .execute()

  await db.schema
    .createIndex('messages_reactions_target_idx')
    .on('messages_reactions')
    .columns(['target_kind', 'target_id'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('messages_reactions').execute()
}
