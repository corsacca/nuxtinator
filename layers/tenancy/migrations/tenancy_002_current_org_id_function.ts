import { type Kysely, sql } from 'kysely'

// Postgres function used as the column DEFAULT for every retrofitted tenant
// table. Reads the `app.current_org` GUC (set via `SET LOCAL` inside
// `defineTenantHandler`'s transaction). When the GUC is unset the function
// returns NULL — combined with `NOT NULL` on the column, this fail-loud
// behavior prevents an INSERT from ever silently writing the wrong org_id.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid
      LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('app.current_org', true), '')::uuid $$
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP FUNCTION IF EXISTS current_org_id()`.execute(db)
}
