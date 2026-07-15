import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration for knowledge entries. Adds org_id + RLS only — no
// unique to rescope (a knowledge entry has no natural key), and the SET-NULL
// conversation FK is nullable so it can't be relied on to org-bind a row. The
// helper is inlined to avoid alias resolution at migration-load time.
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
  await enableTenantScoping(db, 'inbox_knowledge_entries')
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON inbox_knowledge_entries`.execute(db)
  await sql`ALTER TABLE inbox_knowledge_entries DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE inbox_knowledge_entries DROP COLUMN org_id`.execute(db)
}
