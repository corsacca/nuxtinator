// Seed runner. Drives per-layer seed scripts in dependency order.
//
// Each layer ships an optional `seeds/index.ts` that default-exports an
// async `(ctx: SeedContext) => Promise<void>`. The runner imports and
// executes them in the same order they appear in `host/nuxt.config.ts`
// `extends:` — so core's users/roles exist before tenancy creates orgs,
// and the demo org exists before the messages seed creates channels.
//
// Layers without a seeds/ folder are skipped silently.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Kysely, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import type { SeedContext } from './types'

const HERE = dirname(fileURLToPath(import.meta.url))

// Defaults to the layout used in dev (host/ next to layers/). Override via
// LAYERS_PATH if seeding a different working copy.
const LAYERS_PATH = process.env.LAYERS_PATH
  ? resolve(process.cwd(), process.env.LAYERS_PATH)
  : resolve(HERE, '../..')

// Mirror of host/nuxt.config.ts `extends:` order, minus dev (no demo data
// to seed there). Tenancy is auto-skipped at runtime if its tables don't
// exist — listing it here is harmless in single-tenant deploys.
const SEED_LAYERS = [
  'core',
  'tenancy',
  'apps/calendar',
  'apps/kanban',
  'apps/messages'
]

function buildDb(): Kysely<any> {
  // BYPASSRLS connection (host_admin in multi-tenant deploys, the lone
  // role in single-tenant). The seed needs to write across orgs, so we
  // pick DATABASE_URL ahead of APP_DATABASE_URL.
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1')
  return new Kysely<any>({
    dialect: new PostgresJSDialect({
      postgres: postgres(url, {
        ssl: isLocal ? false : 'require',
        prepare: false,
        max: 4,
        onnotice: () => {}
      })
    })
  })
}

async function detectTenancy(db: Kysely<any>): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'orgs'
    ) AS exists
  `.execute(db)
  return result.rows[0]?.exists === true
}

export async function runSeeds(): Promise<void> {
  const db = buildDb()
  try {
    const tenancyEnabled = await detectTenancy(db)

    const ctx: SeedContext = {
      db,
      tenancyEnabled,
      users: [],
      orgId: null,
      orgSlug: null,
      log: (...parts) => console.log('  ', ...parts)
    }

    console.log(`[seed] tenancy mode: ${tenancyEnabled ? 'multi' : 'single'}`)
    console.log(`[seed] layers root: ${LAYERS_PATH}`)

    for (const layer of SEED_LAYERS) {
      if (layer === 'tenancy' && !tenancyEnabled) {
        console.log(`[seed] skip ${layer} (tables not present)`)
        continue
      }
      const seedPath = resolve(LAYERS_PATH, layer, 'seeds/index.ts')
      if (!existsSync(seedPath)) continue

      console.log(`[seed] ${layer}`)
      const mod = await import(pathToFileURL(seedPath).href) as { default?: (ctx: SeedContext) => Promise<void> }
      if (typeof mod.default !== 'function') {
        console.warn(`[seed] ${layer}: no default export, skipping`)
        continue
      }
      await mod.default(ctx)
    }

    console.log('[seed] done')
  } finally {
    await db.destroy().catch(() => {})
  }
}
