import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('columns')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', col => col.notNull().unique())
    .addColumn('position', 'integer', col => col.notNull())
    .addColumn('wip_limit', 'integer')
    .addColumn('is_collapsed', 'boolean', col => col.notNull().defaultTo(false))
    .addColumn('post_meta', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`
    INSERT INTO columns (name, position, is_collapsed, post_meta) VALUES
      ('FEEDBACK INBOX', 1, false, '{"requires_human_approval": true}'::jsonb),
      ('BACKLOG',        2, false, '{}'::jsonb),
      ('PLANNING',       3, false, '{}'::jsonb),
      ('BUILDING',       4, false, '{}'::jsonb),
      ('TESTING',        5, false, '{}'::jsonb),
      ('DONE',           6, false, '{}'::jsonb),
      ('ARCHIVE',        7, true,  '{}'::jsonb)
    ON CONFLICT (name) DO NOTHING
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('columns').ifExists().execute()
}
