import { Kysely, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import type { Database } from '../database/schema'

let _db: Kysely<Database> | null = null

function getDb(): Kysely<Database> {
  if (_db) return _db

  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is not set')

  _db = new Kysely<Database>({
    dialect: new PostgresJSDialect({
      postgres: postgres(databaseUrl, {
        ssl: false,
        max: 5,
        idle_timeout: 5,
        connect_timeout: 5,
        onnotice: () => {}
      })
    })
  })

  return _db
}

export const db = new Proxy({} as Kysely<Database>, {
  get: (_, prop) => {
    const real = getDb()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (real as any)[prop]
    return typeof value === 'function' ? value.bind(real) : value
  }
})

export { getDb, sql }
