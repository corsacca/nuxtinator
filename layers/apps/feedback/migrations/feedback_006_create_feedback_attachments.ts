import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('feedback_attachments')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('card_id', 'uuid', col =>
      col.notNull().references('cards.id').onDelete('cascade'))
    .addColumn('kind', 'text', col =>
      col.notNull().check(sql`kind in ('screenshot','attachment')`))
    .addColumn('storage_key', 'text', col => col.notNull())
    .addColumn('filename', 'text', col => col.notNull())
    .addColumn('mime_type', 'text', col => col.notNull())
    .addColumn('size_bytes', 'integer', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_feedback_attachments_card')
    .on('feedback_attachments')
    .column('card_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('feedback_attachments').ifExists().execute()
}
