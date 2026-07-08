import { type Kysely, sql } from 'kysely'

// Conversation tags: a jsonb array of palette slugs on each conversation. The
// palette (slug → name/color) is a per-org core_settings document — the DB
// stores only slugs; names and colours resolve from the palette in code. The
// column rides the already-RLS'd inbox_conversations table, so no tenant
// retrofit (_T migration) is needed. The GIN index backs containment filtering
// (tags @> '["slug"]').
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE inbox_conversations ADD COLUMN tags jsonb NOT NULL DEFAULT '[]'::jsonb`.execute(db)
  await sql`CREATE INDEX idx_inbox_conversations_tags ON inbox_conversations USING gin (tags)`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_inbox_conversations_tags`.execute(db)
  await sql`ALTER TABLE inbox_conversations DROP COLUMN tags`.execute(db)
}
