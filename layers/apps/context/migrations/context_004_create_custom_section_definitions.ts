import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE context_custom_section_definitions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      portfolio_id uuid NOT NULL REFERENCES context_portfolios(id) ON DELETE CASCADE,
      key text NOT NULL,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      "order" integer NOT NULL DEFAULT 0,
      created_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX context_custom_sections_portfolio_key_uq
      ON context_custom_section_definitions (portfolio_id, key)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS context_custom_section_definitions`.execute(db)
}
