import { type Kysely, sql } from 'kysely'

// Tier 5 of the permission merge. Per-org grant/revoke diffs over static
// roles. RLS-protected: an INSERT/UPDATE/DELETE without `app.current_org`
// set returns no rows and the missing-safe predicate filters reads to the
// active org only.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createType('role_override_effect')
    .asEnum(['grant', 'revoke'])
    .execute()

  await db.schema
    .createTable('org_role_overrides')
    .addColumn('org_id', 'uuid', col =>
      col.notNull()
        .defaultTo(sql`current_org_id()`)
        .references('orgs.id')
        .onDelete('cascade')
    )
    .addColumn('role_name', 'text', col => col.notNull())
    .addColumn('permission', 'text', col => col.notNull())
    .addColumn('effect', sql`role_override_effect`, col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('org_role_overrides_pk', ['org_id', 'role_name', 'permission'])
    .execute()

  await sql`ALTER TABLE org_role_overrides ENABLE ROW LEVEL SECURITY`.execute(db)
  await sql`
    CREATE POLICY tenant_isolation ON org_role_overrides FOR ALL
      USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
      WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('org_role_overrides').execute()
  await db.schema.dropType('role_override_effect').execute()
}
