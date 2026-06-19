import { type Kysely, sql } from 'kysely'

// Retrofits the host's `core_settings` store for multi-tenant mode. In single
// mode it's a deployment-global key-value store, unique by `(namespace, key)`.
// Here we add `org_id NOT NULL DEFAULT current_org_id()` + RLS so every setting
// is scoped to one org, and replace the global uniqueness with a per-org one so
// each org keeps its own value for the same setting key.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE core_settings
      ADD COLUMN org_id uuid NOT NULL DEFAULT current_org_id()
        REFERENCES orgs(id) ON DELETE CASCADE
  `.execute(db)

  // Replace the global (namespace, key) uniqueness with per-org
  // (org_id, namespace, key).
  await sql`ALTER TABLE core_settings DROP CONSTRAINT IF EXISTS core_settings_scope_key`.execute(db)
  await db.schema
    .createIndex('core_settings_org_scope_key_unique')
    .unique()
    .on('core_settings')
    .columns(['org_id', 'namespace', 'key'])
    .execute()

  await sql`ALTER TABLE core_settings ENABLE ROW LEVEL SECURITY`.execute(db)
  await sql`
    CREATE POLICY tenant_isolation ON core_settings FOR ALL
      USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
      WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON core_settings`.execute(db)
  await sql`ALTER TABLE core_settings DISABLE ROW LEVEL SECURITY`.execute(db)
  await db.schema.dropIndex('core_settings_org_scope_key_unique').execute()
  await sql`ALTER TABLE core_settings ADD CONSTRAINT core_settings_scope_key UNIQUE (namespace, key)`.execute(db)
  await sql`ALTER TABLE core_settings DROP COLUMN org_id`.execute(db)
}
