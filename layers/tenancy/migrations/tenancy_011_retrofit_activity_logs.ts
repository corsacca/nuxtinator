import { type Kysely, sql } from 'kysely'

// Retrofits `activity_logs` for multi-tenant mode. Unlike most tenant tables,
// activity_logs allows `org_id` to be NULL — host-admin / cross-org events
// without an active org context still need to record. Read isolation is
// done in the application layer (queries explicitly filter by `org_id`)
// rather than by RLS, since "select all logs without org" is a legitimate
// host-admin operation.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE activity_logs
      ADD COLUMN org_id uuid DEFAULT current_org_id()
        REFERENCES orgs(id) ON DELETE SET NULL
  `.execute(db)

  await db.schema.createIndex('activity_logs_org_idx').on('activity_logs').column('org_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('activity_logs_org_idx').execute()
  await sql`ALTER TABLE activity_logs DROP COLUMN org_id`.execute(db)
}
