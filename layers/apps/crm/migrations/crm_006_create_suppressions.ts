import { type Kysely, sql } from 'kysely'

// Delivery suppressions per channel (hard bounces, complaints, manual
// blocks). Producers claim the channel row first, then suppress by FK.
// Inserts use ON CONFLICT DO NOTHING with no named conflict target
// (first-write-wins); the partial unique below is what that lands on — one
// active suppression per channel, cleared rows kept as history.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('crm_channel_suppressions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('channel_id', 'uuid', col => col.notNull().references('crm_channels.id').onDelete('cascade'))
    .addColumn('reason', 'text', col =>
      col.notNull().check(sql`reason IN ('hard_bounce', 'complaint', 'manual')`))
    .addColumn('detail', 'text')
    .addColumn('source', 'text')
    .addColumn('created_by', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('cleared_at', 'timestamptz')
    .execute()

  await sql`
    CREATE UNIQUE INDEX crm_channel_suppressions_active_uniq
      ON crm_channel_suppressions (channel_id)
      WHERE cleared_at IS NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('crm_channel_suppressions').execute()
}
