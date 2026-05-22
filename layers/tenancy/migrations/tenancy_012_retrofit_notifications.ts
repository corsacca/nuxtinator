import { type Kysely, sql } from 'kysely'

// Retrofits the core `notifications` table for multi-tenant mode. Adds
// `org_id NOT NULL DEFAULT current_org_id()` + RLS so the bell, unread counts,
// and digest are isolated per org. `createNotification` always runs inside a
// request transaction with the `app.current_org` GUC set, so the default fills
// `org_id` automatically and the active-org scoping the design relies on falls
// out of RLS for free.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE notifications
      ADD COLUMN org_id uuid NOT NULL DEFAULT current_org_id()
        REFERENCES orgs(id) ON DELETE CASCADE
  `.execute(db)

  await sql`ALTER TABLE notifications ENABLE ROW LEVEL SECURITY`.execute(db)
  await sql`
    CREATE POLICY tenant_isolation ON notifications FOR ALL
      USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
      WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON notifications`.execute(db)
  await sql`ALTER TABLE notifications DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE notifications DROP COLUMN org_id`.execute(db)
}
