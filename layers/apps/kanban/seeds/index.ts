import type { SeedContext } from '#core/seeds/types'

// Kanban layer has no DB tables yet — board state is held client-side or
// in a future external store. This stub establishes the seed contract.
export default async function seed(ctx: SeedContext): Promise<void> {
  ctx.log('kanban: no demo data')
}
