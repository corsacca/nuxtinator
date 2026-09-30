import { type Kysely, sql } from 'kysely'

// Tenancy retrofit for the library tables (runs only with the tenancy layer).
// Same shape as helpinator_T010.

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

const TABLES = ['helpinator_libraries', 'helpinator_library_sources', 'helpinator_library_pages', 'helpinator_library_chunks']

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const t of TABLES) await enableTenantScoping(db, t)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const t of [...TABLES].reverse()) await disableTenantScoping(db, t)
}
