import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration for the canned-responses table (created after the
// base set, so it needs its own org_id + RLS). Only included when the tenancy
// layer is loaded (filename contains `_T<NNN>_`). The helper is inlined rather
// than imported to avoid alias resolution at migration-load time.
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

export async function up(db: Kysely<unknown>): Promise<void> {
  await enableTenantScoping(db, 'inbox_canned_responses')
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON inbox_canned_responses`.execute(db)
  await sql`ALTER TABLE inbox_canned_responses DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE inbox_canned_responses DROP COLUMN org_id`.execute(db)
}
