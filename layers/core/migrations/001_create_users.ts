import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db)

  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('created', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('email', 'text', col => col.notNull().unique())
    .addColumn('display_name', 'text', col => col.notNull())
    .addColumn('avatar', 'text', col => col.notNull().defaultTo(''))
    .addColumn('password', 'text')
    .addColumn('verified', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('is_admin', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('roles', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('token_key', 'text', col => col.notNull().defaultTo(sql`encode(gen_random_bytes(16), 'hex')`))
    .addColumn('token_expires_at', 'timestamptz')
    .addColumn('pending_email', 'text')
    .addColumn('email_change_token', 'text')
    .execute()

  await db.schema.createIndex('users_email_lower_idx').on('users').expression(sql`lower(email)`).execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('users').execute()
}
