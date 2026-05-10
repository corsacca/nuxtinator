import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Per-user tag vocabulary.
  await db.schema
    .createTable('messages_user_tags')
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('tag_name', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('messages_user_tags_pk', ['user_id', 'tag_name'])
    .execute()

  // Per-user tag application to an item.
  await db.schema
    .createTable('messages_item_tags')
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('item_id', 'uuid', col =>
      col.notNull().references('messages_items.id').onDelete('cascade'))
    .addColumn('tag_name', 'text', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('messages_item_tags_pk', ['user_id', 'item_id', 'tag_name'])
    .execute()

  await db.schema
    .createIndex('messages_item_tags_user_tag_idx')
    .on('messages_item_tags')
    .columns(['user_id', 'tag_name'])
    .execute()

  // Per-user star on an item.
  await db.schema
    .createTable('messages_item_stars')
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('item_id', 'uuid', col =>
      col.notNull().references('messages_items.id').onDelete('cascade'))
    .addColumn('starred_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('messages_item_stars_pk', ['user_id', 'item_id'])
    .execute()

  await db.schema
    .createIndex('messages_item_stars_user_idx')
    .on('messages_item_stars')
    .columns(['user_id', 'starred_at'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('messages_item_stars').execute()
  await db.schema.dropTable('messages_item_tags').execute()
  await db.schema.dropTable('messages_user_tags').execute()
}
