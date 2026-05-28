import type { SeedContext } from '#core/seeds/types'

// Calendar layer has no DB tables (events come from connected sources at
// runtime). Nothing to seed — keep this stub as the layer's seed contract
// so adding demo data later means editing one file in a known location.
export default async function seed(ctx: SeedContext): Promise<void> {
  ctx.log('calendar: no demo data')
}
