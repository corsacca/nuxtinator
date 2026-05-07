import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createType('org_app_source')
    .asEnum(['auto', 'org_admin', 'host'])
    .execute()

  await db.schema
    .createTable('org_apps')
    .addColumn('org_id', 'uuid', col => col.notNull().references('orgs.id').onDelete('cascade'))
    .addColumn('app_id', 'text', col => col.notNull().references('apps.id').onDelete('cascade'))
    .addColumn('enabled', 'boolean', col => col.notNull())
    .addColumn('source', sql`org_app_source`, col => col.notNull())
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('org_apps_pk', ['org_id', 'app_id'])
    .execute()

  await db.schema.createIndex('org_apps_app_idx').on('org_apps').column('app_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('org_apps').execute()
  await db.schema.dropType('org_app_source').execute()
}
