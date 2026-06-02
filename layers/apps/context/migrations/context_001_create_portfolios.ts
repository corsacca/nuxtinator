import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE context_portfolios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL,
      name text NOT NULL,
      color text,
      icon_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX context_portfolios_slug_uq
      ON context_portfolios (slug)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS context_portfolios`.execute(db)
}
