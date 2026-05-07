import { type Kysely, sql } from 'kysely'

// Global custom roles table.
//
// In single-tenant mode, custom_roles is a flat global table of role-name →
// permission-set bundles. Roles get assigned to users via `users.roles[]`.
//
// In multi-tenant mode, the tenancy layer ALTERs this table to add
// `org_id NOT NULL DEFAULT current_org_id()` + RLS so the same `name` can be
// used by different orgs and rows are isolated.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('custom_roles')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('created', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('name', 'text', col => col.notNull().unique())
    .addColumn('description', 'text', col => col.notNull().defaultTo(''))
    .addColumn('permissions', sql`text[]`, col => col.notNull().defaultTo(sql`'{}'::text[]`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('custom_roles').execute()
}
