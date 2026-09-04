// Vitest global setup for the `gmail` project. Boots the dev host with the
// test DB env and the in-memory fake transport, with fast sweep cadences so
// queued sends and session ticks become observable within a test's patience.
import { createTest, exposeContextToEnv } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { getHostAdminDb, closeTestDatabases, cleanupGmailTestData, cleanupTenancyTestData, cleanupCoreTestData } from './helpers'

const HOST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../dev')

const hooks = createTest({
  rootDir: HOST_DIR,
  server: true,
  browser: false,
  env: { NODE_ENV: 'development' },
  nuxtConfig: {
    vite: {
      define: {
        'process.env.NODE_ENV': JSON.stringify('development')
      }
    },
    nitro: {
      replace: {
        'process.env.NODE_ENV': JSON.stringify('development')
      }
    }
  }
})

export async function setup() {
  if (!process.env.TEST_DATABASE_URL || !process.env.TEST_APP_DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL and TEST_APP_DATABASE_URL must be set in dev/.env. Run scripts/setup-test-db.sh.'
    )
  }

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.APP_DATABASE_URL = process.env.TEST_APP_DATABASE_URL
  process.env.NODE_ENV = 'development'
  process.env.GMAIL_TRANSPORT = 'fake'
  process.env.NUXT_GMAIL_TRANSPORT = 'fake'
  process.env.GMAIL_SYNC_TICK_SECONDS = '2'
  process.env.NUXT_GMAIL_SYNC_TICK_SECONDS = '2'
  process.env.GMAIL_SEND_SWEEP_SECONDS = '1'
  process.env.NUXT_GMAIL_SEND_SWEEP_SECONDS = '1'

  await hooks.beforeAll()
  exposeContextToEnv()

  const admin = getHostAdminDb()
  await cleanupGmailTestData(admin)
  await cleanupTenancyTestData(admin)
  await cleanupCoreTestData(admin)
}

export async function teardown() {
  try {
    const admin = getHostAdminDb()
    await cleanupGmailTestData(admin)
  } finally {
    await closeTestDatabases()
    await hooks.afterAll()
  }
}
