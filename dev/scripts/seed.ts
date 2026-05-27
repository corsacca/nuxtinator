#!/usr/bin/env bun

// Demo data seeder. Populates the database with users, roles, a demo org
// (multi-tenant deploys only) and per-app demo content (channels, etc).
//
//   bun run seed
//
// Idempotent: every insert uses ON CONFLICT DO NOTHING so re-running is
// safe. Layer authors add their own seed by creating `<layer>/seeds/index.ts`
// with a default export `(ctx: SeedContext) => Promise<void>`. The runner
// in layers/core/seeds/runner.ts walks the layers in `extends:` order and
// invokes whichever it finds.

import { runSeeds } from '../../layers/core/seeds/runner'

runSeeds().catch((err) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
