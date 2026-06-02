import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE context_section_comment_replies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      comment_id uuid NOT NULL REFERENCES context_section_comments(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id),
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`
    CREATE INDEX context_section_comment_replies_comment_idx
      ON context_section_comment_replies (comment_id, created_at)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS context_section_comment_replies`.execute(db)
}
