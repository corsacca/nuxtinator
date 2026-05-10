import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('card_column_history')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('card_id', 'uuid', col =>
      col.notNull().references('cards.id').onDelete('cascade'))
    .addColumn('column_id', 'uuid', col =>
      col.references('columns.id').onDelete('set null'))
    .addColumn('moved_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('idx_card_history_card')
    .on('card_column_history')
    .column('card_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('card_column_history').ifExists().execute()
}
