// Portfolio section list. Every section a portfolio has is a row in
// `context_section_definitions`; this reads those rows and fills in the
// code-owned defaults for built-in rows (title, description, order, and
// staleness from the portfolio's template in `portfolio-template-registry.ts`).
// A custom row carries its own title/description.
//
// Not built on `defineSettings`: that helper is registry-first (code decides
// what exists, the DB only overrides). Here the portfolio's rows decide what
// exists — the template only supplies the defaults for the keys it declares.

import type { DbClient } from '#core/server/utils/settings'
import type { SectionDef } from './section-catalog'
import { getRegisteredPortfolioTemplate } from './portfolio-template-registry'

export interface MergedSection extends SectionDef {
  id: string
  is_custom: boolean
}

const warnedTemplates = new Set<string>()

// The sections a portfolio's template declares. A stored template id that is
// no longer registered declares none, so its keys read as orphans.
export async function getPortfolioTemplateSections(
  tx: DbClient,
  portfolioId: string
): Promise<readonly SectionDef[]> {
  const row = await tx
    .selectFrom('context_portfolios')
    .select('template')
    .where('id', '=', portfolioId)
    .executeTakeFirst()
  const template = getRegisteredPortfolioTemplate(row?.template)
  if (!template && row?.template && !warnedTemplates.has(row.template)) {
    warnedTemplates.add(row.template)
    console.warn(`[context] portfolio template "${row.template}" is not registered; its sections resolve as orphans`)
  }
  return template?.sections ?? []
}

// A stored `order` is the section's absolute position, whatever kind of
// section it is, so a custom section can sit between two built-ins. With no
// stored position a built-in sits where its template puts it and a custom
// sits past the template's last section.
function resolveOrder(builtins: readonly SectionDef[], key: string, order: number | null): number {
  if (order !== null) return order
  return builtins.find(s => s.key === key)?.order
    ?? Math.max(0, ...builtins.map(s => s.order)) + 1
}

export async function getPortfolioSections(
  tx: DbClient,
  portfolioId: string
): Promise<MergedSection[]> {
  const builtins = await getPortfolioTemplateSections(tx, portfolioId)
  const rows = await tx
    .selectFrom('context_section_definitions')
    .select(['id', 'key', 'title', 'description', 'order'])
    .where('portfolio_id', '=', portfolioId)
    .orderBy('created_at')
    .orderBy('key')
    .execute()

  return rows
    .map((row) => {
      const t = builtins.find(s => s.key === row.key)
      return {
        id: row.id,
        key: row.key,
        title: row.title ?? t?.title ?? row.key,
        description: row.description ?? t?.description ?? '',
        order: resolveOrder(builtins, row.key, row.order),
        staleness_days: t?.staleness_days ?? 60,
        is_custom: !t
      }
    })
    // Stable, so sections sharing a position stay in creation order.
    .sort((a, b) => a.order - b.order)
}

// Where a section added now should sit. A portfolio the user has ordered
// explicitly keeps new sections at the end; one still on template order stores
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
  const builtins = await getPortfolioTemplateSections(tx, portfolioId)
  return Math.max(0, ...rows.map(r => resolveOrder(builtins, r.key, r.order))) + 1
}
