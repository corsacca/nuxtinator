import { type Kysely, sql } from 'kysely'

// AI drafting metadata on messages. ai_generated flags AI-authored drafts and is
// the write-guard for regenerate — an update that requires ai_generated = true
// never overwrites a human-written draft. ai_metadata carries the reviewer-only
// gloss / sources / uncertainty / model (never emailed). Both ride the already-
// RLS'd inbox_messages table, so no _T retrofit is needed.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE inbox_messages ADD COLUMN ai_generated boolean NOT NULL DEFAULT false`.execute(db)
  await sql`ALTER TABLE inbox_messages ADD COLUMN ai_metadata jsonb`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE inbox_messages DROP COLUMN ai_metadata`.execute(db)
  await sql`ALTER TABLE inbox_messages DROP COLUMN ai_generated`.execute(db)
}
