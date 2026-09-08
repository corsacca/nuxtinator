// Portfolio section list. Every section a portfolio has is a row in
// `context_section_definitions`; this reads those rows and fills in the
// code-owned defaults for built-in rows (title, description, order, and
// staleness from `section-catalog.ts`). A custom row carries its own
// title/description/order and sorts after every built-in.
//
// Not built on `defineSettings`: that helper is registry-first (code decides
// what exists, the DB only overrides). Here the portfolio's rows decide what
// exists — the catalog is only the template a portfolio was created from.

import type { DbClient } from '#core/server/utils/settings'
import { CONTEXT_SECTIONS, getDefaultSection, type SectionDef } from './section-catalog'

export interface MergedSection extends SectionDef {
  id: string
  is_custom: boolean
}

const BUILTIN_MAX_ORDER = Math.max(0, ...CONTEXT_SECTIONS.map(s => s.order))

export async function getPortfolioSections(
  tx: DbClient,
  portfolioId: string
): Promise<MergedSection[]> {
  const rows = await tx
    .selectFrom('context_section_definitions')
    .select(['id', 'key', 'title', 'description', 'order'])
    .where('portfolio_id', '=', portfolioId)
    .execute()

  return rows
    .map((row) => {
      const t = getDefaultSection(row.key)
      return {
        id: row.id,
        key: row.key,
        title: row.title ?? t?.title ?? row.key,
        description: row.description ?? t?.description ?? '',
        order: t ? (row.order ?? t.order) : BUILTIN_MAX_ORDER + 1 + (row.order ?? 0),
        staleness_days: t?.staleness_days ?? 60,
        is_custom: !t
      }
    })
    .sort((a, b) => a.order - b.order)
}
