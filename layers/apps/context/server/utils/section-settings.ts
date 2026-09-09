// Portfolio section list. Every section a portfolio has is a row in
// `context_section_definitions`; this reads those rows and fills in the
// code-owned defaults for built-in rows (title, description, order, and
// staleness from `section-catalog.ts`). A custom row carries its own
// title/description.
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

// A stored `order` is the section's absolute position, whatever kind of
// section it is, so a custom section can sit between two built-ins. With no
// stored position a built-in sits where the catalog puts it and a custom sits
// past the last built-in.
function resolveOrder(key: string, order: number | null): number {
  if (order !== null) return order
  return getDefaultSection(key)?.order ?? BUILTIN_MAX_ORDER + 1
}

export async function getPortfolioSections(
  tx: DbClient,
  portfolioId: string
): Promise<MergedSection[]> {
  const rows = await tx
    .selectFrom('context_section_definitions')
    .select(['id', 'key', 'title', 'description', 'order'])
    .where('portfolio_id', '=', portfolioId)
    .orderBy('created_at')
    .orderBy('key')
    .execute()

  return rows
    .map((row) => {
      const t = getDefaultSection(row.key)
      return {
        id: row.id,
        key: row.key,
        title: row.title ?? t?.title ?? row.key,
        description: row.description ?? t?.description ?? '',
        order: resolveOrder(row.key, row.order),
        staleness_days: t?.staleness_days ?? 60,
        is_custom: !t
      }
    })
    // Stable, so sections sharing a position stay in creation order.
    .sort((a, b) => a.order - b.order)
}

// Where a section added now should sit. A portfolio the user has ordered
// explicitly keeps new sections at the end; one still on catalog order stores
// no position at all and resolves from code.
export async function nextExplicitOrder(
  tx: DbClient,
  portfolioId: string
): Promise<number | undefined> {
  const rows = await tx
    .selectFrom('context_section_definitions')
    .select(['key', 'order'])
    .where('portfolio_id', '=', portfolioId)
    .execute()

  if (!rows.some(r => r.order !== null)) return undefined
  return Math.max(0, ...rows.map(r => resolveOrder(r.key, r.order))) + 1
}
