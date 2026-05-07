// Vitest globalSetup hook. Runs migrations against $TEST_DATABASE_URL once
// before the suite, then truncates the test tables once after, so each
// test file starts against a clean schema. Per-test row tracking via the
// harness handles isolation between tests.
//
// Skips when TEST_DATABASE_URL is unset — unit suite still runs.
import { fileURLToPath } from 'node:url'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Kysely, Migrator, FileMigrationProvider, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'

const FIXTURE_MIGRATIONS = fileURLToPath(new URL('./fixtures/consumer/migrations', import.meta.url))
const OAUTH_MIGRATIONS = fileURLToPath(new URL('../../oauth/migrations', import.meta.url))

export async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    console.warn('[mcp-layer tests] TEST_DATABASE_URL not set — integration suite will fail / skip')
    return
  }

  const pg = postgres(url, { ssl: false, max: 2, idle_timeout: 5, connect_timeout: 5, onnotice: () => {} })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = new Kysely<any>({ dialect: new PostgresJSDialect({ postgres: pg }) })

  try {
    // Each source gets its own migration tracking table — Kysely's default
    // table name is shared, so running fixture migrations and OAuth
    // migrations against one table causes "missing migration" complaints
    // when the second migrator can't find the first migrator's file names.
    const sources: Array<{ dir: string; tableName: string }> = [
      { dir: FIXTURE_MIGRATIONS, tableName: 'kysely_migration_fixture' },
      { dir: OAUTH_MIGRATIONS, tableName: 'kysely_migration_oauth' }
    ]

    for (const { dir, tableName } of sources) {
      const exists = await fs.access(dir).then(() => true).catch(() => false)
      if (!exists) throw new Error(`migration dir missing: ${dir}`)

      const migrator = new Migrator({
        db,
        provider: new FileMigrationProvider({ fs, path, migrationFolder: dir }),
        migrationTableName: tableName,
        migrationLockTableName: `${tableName}_lock`
      })
      const { error, results } = await migrator.migrateToLatest()
      if (error) throw error
      for (const r of results ?? []) {
        if (r.status === 'Error') throw new Error(`migration ${r.migrationName} failed in ${dir}`)
      }
    }

    // Wipe data (preserve schema) so the suite starts clean. Disable FK checks
    // for the duration via TRUNCATE ... CASCADE.
    await sql`
      TRUNCATE
        oauth_refresh_tokens,
        oauth_access_tokens,
        oauth_authorization_codes,
        oauth_pending_requests,
        oauth_consents,
        oauth_token_families,
        oauth_clients,
        activity_logs,
        users
      RESTART IDENTITY CASCADE
    `.execute(db)
  }
  finally {
    await db.destroy()
  }
}

export async function teardown(): Promise<void> {
  // Nothing to do — per-test cleanup runs via cleanupFixtures().
  // Leaving rows behind would only be visible until the next suite truncates.
}
