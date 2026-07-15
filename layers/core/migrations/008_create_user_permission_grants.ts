import { type Kysely, sql } from 'kysely'

// Per-user additive permission grants. A row means "this user holds this
// permission directly", on top of whatever their roles resolve to — the
// kernels union role permissions with these rows to build the effective set.
// Grants are additive-only; there is no deny concept (a too-fat role means
// make a leaner role, not a subtraction row).
//
// `permission` stores the slug only — the registry (code) is the source of
// truth for which slugs exist; rows whose slug is no longer registered are
// orphans and stop granting. `granted_by` records who issued the grant and
// survives the granter's deletion as NULL.
//
// In single-tenant mode a grant is per-user (unique on user_id + permission).
// In multi-tenant mode the tenancy layer's `tenancy_014` retrofit adds
// `org_id NOT NULL DEFAULT current_org_id()` + RLS and rescopes the unique
// to (org_id, user_id, permission), making a grant per-(user, org) — RLS
// isolates rows but does not scope unique constraints, so the constraint
// must carry org_id explicitly.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_permission_grants')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('permission', 'text', col => col.notNull())
    .addColumn('granted_by', 'uuid', col => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('user_permission_grants_user_permission_key', ['user_id', 'permission'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_permission_grants').execute()
}
