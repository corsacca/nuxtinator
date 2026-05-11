import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('list_of_100_contacts')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col =>
      col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('relationship', 'text', col =>
      col.notNull().check(sql`relationship IN ('family','friend','coworker','neighbor','classmate','other')`))
    .addColumn('faith_status', 'text', col =>
      col.notNull().check(sql`faith_status IN ('believer','non_believer','unknown')`))
    .addColumn('notes', 'text')
    .addColumn('last_contacted_at', 'timestamptz')
    .addColumn('last_prayed_at', 'timestamptz')
    .addColumn('sort_order', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('list_of_100_contacts_user_idx')
    .on('list_of_100_contacts')
    .column('user_id')
    .execute()

  await db.schema
    .createIndex('list_of_100_contacts_user_faith_idx')
    .on('list_of_100_contacts')
    .columns(['user_id', 'faith_status'])
    .execute()

  await db.schema
    .createIndex('list_of_100_contacts_user_last_contacted_idx')
    .on('list_of_100_contacts')
    .columns(['user_id', 'last_contacted_at'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('list_of_100_contacts').execute()
}
