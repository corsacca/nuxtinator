import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration for the identities table. Adds org_id + RLS, then
// rebuilds both uniques org-leading: RLS scopes what a session SEES, but
// uniques check ALL rows, and both `alias` (routable, externally addressable)
// and `user_id` (a user can belong to several orgs, one identity each) must be
// unique *per org*, not globally. The helper is inlined to avoid alias
// resolution at migration-load time.
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
  await enableTenantScoping(db, 'inbox_identities')

  await db.schema.dropIndex('inbox_identities_user_uniq').execute()
  await sql`CREATE UNIQUE INDEX inbox_identities_org_user_uniq ON inbox_identities (org_id, user_id)`.execute(db)

  await db.schema.dropIndex('inbox_identities_alias_uniq').execute()
  await sql`
    CREATE UNIQUE INDEX inbox_identities_org_alias_uniq
      ON inbox_identities (org_id, alias) WHERE alias IS NOT NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('inbox_identities_org_alias_uniq').execute()
  await sql`CREATE UNIQUE INDEX inbox_identities_alias_uniq ON inbox_identities (alias) WHERE alias IS NOT NULL`.execute(db)
  await db.schema.dropIndex('inbox_identities_org_user_uniq').execute()
  await sql`CREATE UNIQUE INDEX inbox_identities_user_uniq ON inbox_identities (user_id)`.execute(db)

  await sql`DROP POLICY IF EXISTS tenant_isolation ON inbox_identities`.execute(db)
  await sql`ALTER TABLE inbox_identities DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE inbox_identities DROP COLUMN org_id`.execute(db)
}
