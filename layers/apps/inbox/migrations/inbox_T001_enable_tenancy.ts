import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration. Only included by the migrator when the tenancy
// layer is loaded (filename contains `_T<NNN>_`). Adds `org_id` + RLS to
// every inbox table.
//
// All inbox content is per-org: conversations and their messages/attachments,
// and the spam blocklist. (Settings overrides live in core_settings, which
// core's own T-file scopes.) Joins to crm tables happen inside the same org
// transaction, so RLS composes across the layers.

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

// FK-safe order: conversations before the tables that point at them.
const TABLES = [
  'inbox_conversations',
  'inbox_messages',
  'inbox_attachments',
  'inbox_blocked_senders'
] as const

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const t of TABLES) {
    await enableTenantScoping(db, t)
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const t of [...TABLES].reverse()) {
    await disableTenantScoping(db, t)
  }
}
