// Section catalog reader. Built on `defineSettings` — see CLAUDE.md
// → "Settings pattern". Returns the registry catalog merged with the
// portfolio's custom section definitions (DB).
//
// `ctx.orgId` is reused by defineSettings as the join scope, but this reader
// is keyed on `portfolioId` — passed via the second arg to a thin wrapper.

import { defineSettings, type DbClient } from '#core/server/utils/settings'
import { CONTEXT_SECTIONS, type SectionDef } from './section-catalog'

export interface MergedSection extends SectionDef {
  is_custom: boolean
  custom_id: string | null
}

interface CustomRow {
  id: string
  key: string
  title: string
  description: string
  order: number
}

interface PortfolioCtx { portfolioId: string }

const reader = defineSettings<SectionDef, CustomRow, MergedSection>({
  loadDefaults: () => [...CONTEXT_SECTIONS],
  loadOverrides: async (tx, ctx) => {
    const portfolioId = (ctx as PortfolioCtx).portfolioId
    if (!portfolioId) return new Map()
    const rows = await tx
      .selectFrom('context_custom_section_definitions')
      .select(['id', 'key', 'title', 'description', 'order'])
      .where('portfolio_id', '=', portfolioId)
      .execute()
    return new Map(rows.map(r => [r.key, r as CustomRow]))
  },
  keyOf: d => d.key,
  merge: (d, o) => {
    if (d && !o) {
      return {
        key: d.key,
        title: d.title,
        description: d.description,
        order: d.order,
        staleness_days: d.staleness_days,
        is_custom: false,
        custom_id: null
      }
    }
    if (d && o) {
      // Shouldn't happen in practice — custom keys can't collide with default
      // keys (enforced at create-time). Treat the default as authoritative.
      return {
        key: d.key,
        title: d.title,
        description: d.description,
        order: d.order,
        staleness_days: d.staleness_days,
        is_custom: false,
        custom_id: null
      }
    }
    const c = o!
    const baseMax = Math.max(0, ...CONTEXT_SECTIONS.map(s => s.order))
    return {
      key: c.key,
      title: c.title,
      description: c.description,
      order: baseMax + 1 + (c.order ?? 0),
      staleness_days: 60,
      is_custom: true,
      custom_id: c.id
    }
  },
  includeOrphans: true
})

export async function getPortfolioSections(
  tx: DbClient,
  portfolioId: string
): Promise<MergedSection[]> {
  const merged = await reader(tx, { ...({ portfolioId } as object) })
  return merged.sort((a, b) => a.order - b.order)
}
