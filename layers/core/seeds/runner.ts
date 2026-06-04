// Seed runner. Drives per-layer seed scripts in dependency order.
//
// Each layer ships an optional `seeds/index.ts` that default-exports an
// async `(ctx: SeedContext) => Promise<void>`. The runner imports and
// executes them in the same order they appear in `dev/nuxt.config.ts`
// `extends:` — so core's users/roles exist before tenancy creates orgs,
// and the demo org exists before the messages seed creates channels.
//
// Layers without a seeds/ folder are skipped silently.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Kysely, sql } from 'kysely'
import { createKyselyDb } from '../server/utils/db-connection'
import type { SeedContext } from './types'

function resolveLayerRoot(pkg: string): string | null {
  try {
    const url = import.meta.resolve(pkg)
    return dirname(fileURLToPath(url))
  } catch {
    return null
  }
}

function buildDb(): Kysely<any> {
  // BYPASSRLS connection (host_admin in multi-tenant deploys, the lone
  // role in single-tenant). The seed needs to write across orgs, so we
  // pick DATABASE_URL ahead of APP_DATABASE_URL.
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return createKyselyDb<any>(url, { max: 4 })
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

// `layerPkgs` is the host's layer roster (package names) in extends: order,
// passed in by the caller (dev/scripts/seed.ts reads it from dev/layers.ts) so
// the runner stays decoupled from any specific host. Layers without a
// seeds/index.ts are skipped; tenancy is auto-skipped when its tables are absent.
export async function runSeeds(layerPkgs: string[]): Promise<void> {
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

    for (const layer of layerPkgs) {
      if (layer === '@nuxtinator/tenancy' && !tenancyEnabled) {
        console.log(`[seed] skip ${layer} (tables not present)`)
        continue
      }
      const layerRoot = resolveLayerRoot(layer)
      if (!layerRoot) continue
      const seedPath = resolve(layerRoot, 'seeds/index.ts')
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
