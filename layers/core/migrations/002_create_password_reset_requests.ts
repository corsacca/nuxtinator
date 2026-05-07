import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('password_reset_requests')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('created', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('expires', 'timestamptz', col => col.notNull())
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token', 'text', col => col.notNull().unique())
    .addColumn('used', 'boolean', col => col.notNull().defaultTo(false))
    .execute()

  await db.schema.createIndex('password_reset_requests_user_id_idx').on('password_reset_requests').column('user_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('password_reset_requests').execute()
}
