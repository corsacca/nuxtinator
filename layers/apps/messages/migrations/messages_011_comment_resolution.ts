import { type Kysely, sql } from 'kysely'

// Add resolution state to comments. Resolved comments are hidden from the
// main rail flow (collapsed under a "Resolved (N)" disclosure) but kept in
// the database for history and unresolve.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('messages_comments')
    .addColumn('resolved_at', 'timestamptz')
    .execute()
  await db.schema
    .alterTable('messages_comments')
    .addColumn('resolved_by', 'uuid', col => col.references('users.id').onDelete('set null'))
    .execute()
  await sql`
    CREATE INDEX messages_comments_resolved_idx
      ON messages_comments (item_id)
      WHERE resolved_at IS NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS messages_comments_resolved_idx`.execute(db)
  await db.schema.alterTable('messages_comments').dropColumn('resolved_by').execute()
  await db.schema.alterTable('messages_comments').dropColumn('resolved_at').execute()
}
