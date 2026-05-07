import { type Kysely, sql } from 'kysely'

// Retrofits the host's `custom_roles` table for multi-tenant mode. In single
// mode, `custom_roles` is a global lookup table (unique by `name`). Here we
// add `org_id NOT NULL DEFAULT current_org_id()` + RLS, and replace the
// global unique constraint with a per-org one.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE custom_roles
      ADD COLUMN org_id uuid NOT NULL DEFAULT current_org_id()
        REFERENCES orgs(id) ON DELETE CASCADE
  `.execute(db)

  // Replace the global (name) uniqueness with per-org (org_id, name).
  await sql`ALTER TABLE custom_roles DROP CONSTRAINT IF EXISTS custom_roles_name_key`.execute(db)
  await db.schema
    .createIndex('custom_roles_org_name_unique')
    .unique()
    .on('custom_roles')
    .columns(['org_id', 'name'])
    .execute()

  await sql`ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY`.execute(db)
  await sql`
    CREATE POLICY tenant_isolation ON custom_roles FOR ALL
      USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
      WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON custom_roles`.execute(db)
  await sql`ALTER TABLE custom_roles DISABLE ROW LEVEL SECURITY`.execute(db)
  await db.schema.dropIndex('custom_roles_org_name_unique').execute()
  await sql`ALTER TABLE custom_roles ADD CONSTRAINT custom_roles_name_key UNIQUE (name)`.execute(db)
  await sql`ALTER TABLE custom_roles DROP COLUMN org_id`.execute(db)
}
