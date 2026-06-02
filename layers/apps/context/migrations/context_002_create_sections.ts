import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE context_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      portfolio_id uuid NOT NULL REFERENCES context_portfolios(id) ON DELETE CASCADE,
      section_key text NOT NULL,
      content text NOT NULL DEFAULT '',
      last_edited_by uuid REFERENCES users(id) ON DELETE SET NULL,
      last_edited_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX context_sections_portfolio_key_uq
      ON context_sections (portfolio_id, section_key)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS context_sections`.execute(db)
}
