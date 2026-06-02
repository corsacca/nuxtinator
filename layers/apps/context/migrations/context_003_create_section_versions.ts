import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE context_section_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id uuid NOT NULL REFERENCES context_sections(id) ON DELETE CASCADE,
      content text NOT NULL,
      edited_by uuid REFERENCES users(id) ON DELETE SET NULL,
      edited_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`
    CREATE INDEX context_section_versions_section_idx
      ON context_section_versions (section_id, edited_at DESC)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS context_section_versions`.execute(db)
}
