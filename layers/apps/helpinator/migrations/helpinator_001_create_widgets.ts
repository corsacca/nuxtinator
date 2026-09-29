import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// One embeddable widget = one site. Bound to one context portfolio (the only
// content its bot can read) and a default section preloaded into every chat.
// `portfolio_id` is SET NULL on portfolio delete: the widget goes unavailable
// but its conversation log survives.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('helpinator_widgets')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('portfolio_id', 'uuid', col => col.references('context_portfolios.id').onDelete('set null'))
    .addColumn('default_section_key', 'text', col => col.notNull())
    .addColumn('allowed_origins', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('daily_message_cap', 'integer', col => col.notNull().defaultTo(500))
    .addColumn('enabled', 'boolean', col => col.notNull().defaultTo(true))
    .addColumn('appearance', 'jsonb', col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('extra_instructions', 'text', col => col.notNull().defaultTo(''))
    .addColumn('created_by', 'uuid')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('helpinator_widgets').ifExists().execute()
}
