import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('swimlanes')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', col =>
      col.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('is_default', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('position', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('post_meta', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('uq_swimlanes_project_name', ['project_id', 'name'])
    .execute()

  await db.schema
    .createIndex('idx_swimlanes_project')
    .on('swimlanes')
    .column('project_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('swimlanes').ifExists().execute()
}
