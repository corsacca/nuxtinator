import { type Kysely, sql } from 'kysely'

// Per-app tenancy migration. Only included by the migrator when the tenancy
// layer is loaded (filename contains `_T<NNN>_`). Adds `org_id` + RLS to
// every messages table so multi-tenant deploys isolate one org's messages
// from another's.
//
// All messages content is per-org (channels, DMs, items, comments, reactions,
// tags, stars, mentions, read pointers). Notifications moved to the global
// `notifications` table (retrofitted by tenancy_012); see messages_014.

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

const TABLES = [
  'messages_conversations',
  'messages_conversation_members',
  'messages_channel_subscriptions',
  'messages_conversation_reads',
  'messages_items',
  'messages_comments',
  'messages_reactions',
  'messages_user_tags',
  'messages_item_tags',
  'messages_item_stars',
  'messages_mentions'
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
