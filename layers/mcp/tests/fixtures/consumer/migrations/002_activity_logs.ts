import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('activity_logs')
    .ifNotExists()
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('timestamp', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('event_type', 'text', col => col.notNull())
    .addColumn('table_name', 'text')
    .addColumn('record_id', 'text')
    .addColumn('user_id', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('user_agent', 'text')
    .addColumn('metadata', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute()

  await db.schema
    .createIndex('activity_logs_event_type_idx')
    .ifNotExists()
    .on('activity_logs')
    .column('event_type')
    .execute()

  await db.schema
    .createIndex('activity_logs_user_id_idx')
    .ifNotExists()
    .on('activity_logs')
    .column('user_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('activity_logs').ifExists().execute()
}
