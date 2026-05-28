import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE context_section_comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id uuid NOT NULL REFERENCES context_sections(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id),
      quoted_text text NOT NULL,
      anchor_start integer NOT NULL,
      anchor_end integer NOT NULL,
      anchor_hash text NOT NULL,
      content text NOT NULL,
      is_resolved boolean NOT NULL DEFAULT false,
      resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
      resolved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`
    CREATE INDEX context_section_comments_section_idx
      ON context_section_comments (section_id, created_at)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS context_section_comments`.execute(db)
}
