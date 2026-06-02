import { type Kysely, sql } from 'kysely'

// Full content snapshot per doc save. Restore re-saves an old snapshot as a
// new head version. Mirrors the context layer's section-versions pattern.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('files_versions')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('item_id', 'uuid', col =>
      col.notNull().references('files_items.id').onDelete('cascade'))
    .addColumn('title', 'text', col => col.notNull())
    .addColumn('content', 'text', col => col.notNull())
    .addColumn('edited_by', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('edited_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`
    CREATE INDEX files_versions_item_idx
      ON files_versions (item_id, edited_at DESC)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('files_versions').execute()
}
