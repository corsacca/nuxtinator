import { Kysely } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import type { Database } from '~/server/database/schema'

// `adminDb` — BYPASSRLS Kysely client for cross-org operations. Connects as
// the `host_admin` Postgres role. Only the tenancy layer's own `/admin/orgs`
// endpoints + migrations import this. Layer code outside the tenancy layer
// must use `db` from `server/utils/database.ts` (RLS-enforced).
//
// Connection URL: `DATABASE_URL` env var (host_admin role). Symmetric with
// the host's `db` which uses `APP_DATABASE_URL` (app_user role). Single-tenant
// deploys don't load this layer at all and don't need the role split.

let _adminDb: Kysely<Database> | null = null

export const adminDb = new Proxy({} as Kysely<Database>, {
  get: (_, prop) => {
    if (!_adminDb) {
      const url = useRuntimeConfig().databaseUrl || process.env.DATABASE_URL
      if (!url) throw new Error('DATABASE_URL is not set (required for tenancy layer adminDb)')
      const isLocal = url.includes('localhost') || url.includes('127.0.0.1')
      _adminDb = new Kysely<Database>({
        dialect: new PostgresJSDialect({
          postgres: postgres(url, {
            ssl: isLocal ? false : 'require',
            max: 5,
            idle_timeout: 20,
            connect_timeout: 30,
            prepare: false,
            onnotice: () => {}
          })
        })
      })
    }
    const value = (_adminDb as unknown as Record<PropertyKey, unknown>)[prop as PropertyKey]
    return typeof value === 'function' ? value.bind(_adminDb) : value
  }
})
