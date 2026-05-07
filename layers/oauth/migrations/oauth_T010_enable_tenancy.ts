import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration. Only included by the migrator when the tenancy
// layer is loaded (filename contains `_T<NNN>_`).
//
// Adds `org_id` + RLS to the OAuth tables that are inherently org-scoped:
//   - oauth_consents — a user authorizing an OAuth client from inside org A
//     should not silently apply that authorization in org B.
//   - oauth_pending_requests — a pending consent flow belongs to one org.
//
// The token tables (oauth_token_families, oauth_authorization_codes,
// oauth_access_tokens, oauth_refresh_tokens) stay user-scoped: a Gmail token
// represents the user's identity to the third party and shouldn't be
// duplicated per org.

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
  await enableTenantScoping(db, 'oauth_consents')
  await enableTenantScoping(db, 'oauth_pending_requests')
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await disableTenantScoping(db, 'oauth_pending_requests')
  await disableTenantScoping(db, 'oauth_consents')
}
