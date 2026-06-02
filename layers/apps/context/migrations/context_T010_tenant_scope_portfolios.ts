import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration. Only included by the migrator when the tenancy
// layer is loaded (filename contains `_T<NNN>_`). Adds `org_id` + RLS to
// `context_portfolios`. Child tables (sections, versions, custom defs,
// comments, replies) cascade via FK to the portfolio and so are protected
// transitively — direct RLS on them would require duplicating org_id.
//
// Also drops the slug-only unique index and re-creates it as `(org_id, slug)`
// so each org has its own slug namespace.

async function enableTenantScoping(db: Kysely<unknown>, table: string): Promise<void> {
  await sql`
    ALTER TABLE ${sql.ref(table)}
      ADD COLUMN org_id uuid NOT NULL DEFAULT current_org_id()
        REFERENCES orgs(id) ON DELETE CASCADE
  `.execute(db)
  await sql`ALTER TABLE ${sql.ref(table)} ENABLE ROW LEVEL SECURITY`.execute(db)
  await sql`
    CREATE POLICY tenant_isolation ON ${sql.ref(table)} FOR ALL
      USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
      WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)
}

async function disableTenantScoping(db: Kysely<unknown>, table: string): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON ${sql.ref(table)}`.execute(db)
  await sql`ALTER TABLE ${sql.ref(table)} DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE ${sql.ref(table)} DROP COLUMN org_id`.execute(db)
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await enableTenantScoping(db, 'context_portfolios')
  await sql`DROP INDEX IF EXISTS context_portfolios_slug_uq`.execute(db)
  await sql`
    CREATE UNIQUE INDEX context_portfolios_org_slug_uq
      ON context_portfolios (org_id, slug)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS context_portfolios_org_slug_uq`.execute(db)
  await sql`
    CREATE UNIQUE INDEX context_portfolios_slug_uq
      ON context_portfolios (slug)
  `.execute(db)
  await disableTenantScoping(db, 'context_portfolios')
}
