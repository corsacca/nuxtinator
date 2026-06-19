import { type Kysely, sql } from 'kysely'

// Shared key-value settings store. Any layer reads/writes its own settings by
// calling `getSetting` / `setSetting` (see settings-store.ts) instead of
// shipping its own table. A row exists only when a human has chosen a
// non-default value — defaults and labels live in code via `registerSetting()`.
//
// `namespace` is the owning layer's app id (e.g. 'feedback'); `(namespace, key)`
// is unique so two layers can't clobber each other's keys. `value` is jsonb so
// any shape (scalar, array, object) fits one column.
//
// In single-tenant mode this is the only scope — the store is global to the
// deployment. In multi-tenant mode the tenancy layer retrofits an `org_id`
// column + RLS and replaces the unique constraint with `(org_id, namespace,
// key)` so each org keeps its own value (tenancy_013_retrofit_core_settings).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('core_settings')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('namespace', 'text', col => col.notNull())
    .addColumn('key', 'text', col => col.notNull())
    .addColumn('value', 'jsonb', col => col.notNull())
    .addColumn('updated_at', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('core_settings_scope_key', ['namespace', 'key'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('core_settings').execute()
}
