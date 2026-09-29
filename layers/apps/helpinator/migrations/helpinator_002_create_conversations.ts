import type { Kysely } from 'kysely'
import { sql } from 'kysely'

// One visitor chat. The visitor holds an opaque session token; only its sha256
// is stored. `portfolio_id` snapshots the widget's binding at creation — a
// widget rebound to another portfolio ends its old conversations rather than
// silently switching their grounding. `inbox_conversation_id` has no FK: the
// inbox layer is optional.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('helpinator_conversations')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('widget_id', 'uuid', col => col.notNull().references('helpinator_widgets.id').onDelete('cascade'))
    .addColumn('portfolio_id', 'uuid', col => col.notNull())
    .addColumn('session_hash', 'text', col => col.notNull().unique())
    .addColumn('visitor_email', 'text')
    .addColumn('page_url', 'text')
    .addColumn('origin', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('visitor_message_count', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('inbox_conversation_id', 'uuid')
    .addColumn('handoff_kind', 'text')
    .addColumn('handed_off_at', 'timestamptz')
    .addColumn('handed_off_by', 'uuid')
    .addColumn('ended_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('last_message_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('helpinator_conversations_widget_idx')
    .on('helpinator_conversations')
    .columns(['widget_id', 'last_message_at'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('helpinator_conversations').ifExists().execute()
}
