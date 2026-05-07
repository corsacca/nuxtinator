import { sql, type Kysely } from 'kysely'

// Enable Row-Level Security on a tenant table and install the missing-safe
// tenant_isolation policy. Layer authors call this from their migrations
// after creating any table that has an `org_id` column.
//
// The policy reads the `app.current_org` GUC, which `withOrgContext` sets via
// `SET LOCAL` inside its transaction. Two safety nets:
//
//   - `current_setting('app.current_org', true)` — the `, true` makes the
//     function return NULL when the GUC is unset, instead of raising.
//   - `nullif(..., '')` — belt-and-suspenders for someone explicitly setting
//     an empty string.
//
// When the GUC is unset, the predicate evaluates `org_id = NULL` → FALSE → 0
// rows, with no error. A handler that forgets `withOrgContext` returns "no
// data" (safe) instead of "all rows" (leak).
export async function enableRlsForTenantTable(db: Kysely<unknown>, table: string): Promise<void> {
  await sql`ALTER TABLE ${sql.id(table)} ENABLE ROW LEVEL SECURITY`.execute(db)
  await sql`
    CREATE POLICY tenant_isolation ON ${sql.id(table)}
    FOR ALL
    USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
    WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)
}

export async function disableRlsForTenantTable(db: Kysely<unknown>, table: string): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON ${sql.id(table)}`.execute(db)
  await sql`ALTER TABLE ${sql.id(table)} DISABLE ROW LEVEL SECURITY`.execute(db)
}
