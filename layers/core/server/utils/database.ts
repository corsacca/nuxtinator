import { Kysely, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import type { Database } from '#core/server/database/schema'

// Single Kysely client for the host. In multi-tenant mode the tenancy layer
// adds a separate BYPASSRLS `adminDb` client (see
// `optional-tenancy/server/utils/database-admin.ts`); the host never imports it.
//
// Connection URL precedence — `APP_DATABASE_URL` first, then `DATABASE_URL`.
// Single-tenant deploys can set only `DATABASE_URL`. Multi-tenant deploys set
// both: `DATABASE_URL` for the BYPASSRLS `host_admin` role used by migrations
// + admin endpoints, and `APP_DATABASE_URL` for the RLS-enforced `app_user`
// role that this `db` client connects as.
//
// `prepare: false` is required when running through PgBouncer in transaction
// mode (server-side prepared statements collide across reused connections).
// Tiny per-query bump in dev; matches prod behavior.

let _db: Kysely<Database> | null = null

function getDb(): Kysely<Database> {
  if (_db) return _db
  const url = useRuntimeConfig().appDatabaseUrl
    || process.env.APP_DATABASE_URL
    || useRuntimeConfig().databaseUrl
    || process.env.DATABASE_URL
  if (!url) throw new Error('APP_DATABASE_URL (or DATABASE_URL) is not set')
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1')
  _db = new Kysely<Database>({
    dialect: new PostgresJSDialect({
      postgres: postgres(url, {
        ssl: isLocal ? false : 'require',
        max: 10,
        idle_timeout: 20,
        connect_timeout: 30,
        prepare: false,
        onnotice: () => {}
      })
    })
  })
  return _db
}

export const db = new Proxy({} as Kysely<Database>, {
  get: (_, prop) => {
    const real = getDb()
    const value = (real as unknown as Record<PropertyKey, unknown>)[prop as PropertyKey]
    return typeof value === 'function' ? value.bind(real) : value
  }
})

export { sql }
