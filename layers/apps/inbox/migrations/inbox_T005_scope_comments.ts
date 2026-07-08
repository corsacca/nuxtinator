import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration for the comments table: org_id + RLS. The helper is
// inlined to avoid alias resolution at migration-load time. No unique to
// rescope — the FK to inbox_conversations already org-binds each row.
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
  await enableTenantScoping(db, 'inbox_comments')
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON inbox_comments`.execute(db)
  await sql`ALTER TABLE inbox_comments DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE inbox_comments DROP COLUMN org_id`.execute(db)
}
