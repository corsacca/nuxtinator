import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration. Only included by the migrator when the tenancy
// layer is loaded (filename contains `_T<NNN>_`).
//
// Adds `org_id` + RLS to the per-org feedback tables. `columns` is intentionally
// excluded — it's global state shared across all orgs (workflow stages).

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
  await enableTenantScoping(db, 'projects')
  await enableTenantScoping(db, 'swimlanes')
  await enableTenantScoping(db, 'cards')
  await enableTenantScoping(db, 'card_column_history')
  await enableTenantScoping(db, 'feedback_attachments')
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await disableTenantScoping(db, 'feedback_attachments')
  await disableTenantScoping(db, 'card_column_history')
  await disableTenantScoping(db, 'cards')
  await disableTenantScoping(db, 'swimlanes')
  await disableTenantScoping(db, 'projects')
}
