import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration for grounding documents. Adds org_id + RLS, then
// rebuilds the unique org-leading: RLS scopes what a session SEES, but the
// unique checks ALL rows, and `source` + `doc_key` are externally controlled
// (sync source ids + page slugs) so two orgs must be free to snapshot the same
// slug. The helper is inlined to avoid alias resolution at migration-load time.
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
  await enableTenantScoping(db, 'inbox_grounding_documents')

  await db.schema.dropIndex('inbox_grounding_documents_source_doc_key_uniq').execute()
  await sql`
    CREATE UNIQUE INDEX inbox_grounding_documents_org_source_doc_key_uniq
      ON inbox_grounding_documents (org_id, source, doc_key)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('inbox_grounding_documents_org_source_doc_key_uniq').execute()
  await sql`CREATE UNIQUE INDEX inbox_grounding_documents_source_doc_key_uniq ON inbox_grounding_documents (source, doc_key)`.execute(db)

  await sql`DROP POLICY IF EXISTS tenant_isolation ON inbox_grounding_documents`.execute(db)
  await sql`ALTER TABLE inbox_grounding_documents DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE inbox_grounding_documents DROP COLUMN org_id`.execute(db)
}
