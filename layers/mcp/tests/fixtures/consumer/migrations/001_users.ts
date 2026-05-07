import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('users')
    .ifNotExists()
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('email', 'text', col => col.unique().notNull())
    .addColumn('password_hash', 'text')
    .addColumn('display_name', 'text')
    .addColumn('verified', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('roles', sql`text[]`, col => col.notNull().defaultTo(sql`ARRAY[]::text[]`))
    .addColumn('created', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('users').ifExists().execute()
}
