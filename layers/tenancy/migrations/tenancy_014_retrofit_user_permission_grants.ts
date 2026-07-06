import { type Kysely, sql } from 'kysely'

// Retrofits core's `user_permission_grants` table for multi-tenant mode. In
// single mode a grant is user-global (unique by user_id + permission). Here we
// add `org_id NOT NULL DEFAULT current_org_id()` + RLS, and replace the global
// unique constraint with a per-org one — RLS isolates rows between orgs but
// does not scope unique constraints, so the same (user, permission) pair must
// be insertable once per org.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE user_permission_grants
      ADD COLUMN org_id uuid NOT NULL DEFAULT current_org_id()
        REFERENCES orgs(id) ON DELETE CASCADE
  `.execute(db)

  // Replace the global (user_id, permission) uniqueness with per-org
  // (org_id, user_id, permission).
  await sql`ALTER TABLE user_permission_grants DROP CONSTRAINT IF EXISTS user_permission_grants_user_permission_key`.execute(db)
  await db.schema
    .createIndex('user_permission_grants_org_user_permission_unique')
    .unique()
    .on('user_permission_grants')
    .columns(['org_id', 'user_id', 'permission'])
    .execute()

  await sql`ALTER TABLE user_permission_grants ENABLE ROW LEVEL SECURITY`.execute(db)
  await sql`
    CREATE POLICY tenant_isolation ON user_permission_grants FOR ALL
      USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
      WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON user_permission_grants`.execute(db)
  await sql`ALTER TABLE user_permission_grants DISABLE ROW LEVEL SECURITY`.execute(db)
  await db.schema.dropIndex('user_permission_grants_org_user_permission_unique').execute()
  await sql`ALTER TABLE user_permission_grants ADD CONSTRAINT user_permission_grants_user_permission_key UNIQUE (user_id, permission)`.execute(db)
  await sql`ALTER TABLE user_permission_grants DROP COLUMN org_id`.execute(db)
}
