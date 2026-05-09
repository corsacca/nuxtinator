import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('cards')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', col =>
      col.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('swimlane_id', 'uuid', col =>
      col.notNull().references('swimlanes.id').onDelete('cascade'))
    .addColumn('column_id', 'uuid', col =>
      col.references('columns.id').onDelete('set null'))
    .addColumn('title', 'text', col => col.notNull().defaultTo(''))
    .addColumn('post_type', 'text', col =>
      col.notNull().defaultTo('task')
        .check(sql`post_type in ('task','feature','bug','artifact','feedback')`))
    .addColumn('description', 'text')
    .addColumn('assignee', 'text')
    .addColumn('start_date', 'date')
    .addColumn('due_date', 'date')
    .addColumn('priority', 'text')
    .addColumn('is_done', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('testing_results', 'text')
    .addColumn('post_meta', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('last_moved_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema.createIndex('idx_cards_project').on('cards').column('project_id').execute()
  await db.schema.createIndex('idx_cards_column').on('cards').column('column_id').execute()
  await db.schema.createIndex('idx_cards_swimlane').on('cards').column('swimlane_id').execute()
  await db.schema.createIndex('idx_cards_post_type').on('cards').column('post_type').execute()
  await db.schema.createIndex('idx_cards_due_date').on('cards').column('due_date').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cards').ifExists().execute()
}
