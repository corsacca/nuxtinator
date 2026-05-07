import { type Kysely, sql } from 'kysely'

// Global app catalog. App layers register themselves at boot via
// registerApp(); `seed-apps-catalog.ts` upserts rows here. The `status` column
// lets the operator gate apps:
//
//   disabled  — app is off everywhere, no UI, no APIs.
//   available — app is present but off by default; in multi-tenant mode each
//               org turns it on individually via /admin/orgs.
//   default   — app is on for everyone (single mode) or auto-enabled when an
//               org is created (multi mode).
//
// In single-tenant mode `status` is the only gate. In multi-tenant mode the
// tenancy layer adds the per-org `org_apps` table on top.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createType('app_status')
    .asEnum(['disabled', 'available', 'default'])
    .execute()

  await db.schema
    .createTable('apps')
    .addColumn('id', 'text', col => col.primaryKey())
    .addColumn('status', sql`app_status`, col => col.notNull().defaultTo('default'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('apps').execute()
  await db.schema.dropType('app_status').execute()
}
