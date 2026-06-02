// Portfolio-scoped lookups and access guards. Used by every route that
// addresses a single portfolio by slug.
//
// The tenant transaction already restricts visibility to the active org (RLS
// in multi mode, no-op in single). Inside it `lookupBySlug` is a plain
// SELECT — no extra `org_id` filter needed.

import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

export interface PortfolioRow {
  id: string
  slug: string
  name: string
  color: string | null
  icon_url: string | null
  created_at: Date
  updated_at: Date
}

export async function getPortfolioBySlug(
  tx: Transaction<Database>,
  slug: string
): Promise<PortfolioRow | null> {
  const row = await tx
    .selectFrom('context_portfolios')
    .select(['id', 'slug', 'name', 'color', 'icon_url', 'created_at', 'updated_at'])
    .where('slug', '=', slug)
    .executeTakeFirst()
  return (row as PortfolioRow | undefined) ?? null
}

export async function getPortfolioBySlugOr404(
  tx: Transaction<Database>,
  slug: string
): Promise<PortfolioRow> {
  const p = await getPortfolioBySlug(tx, slug)
  if (!p) {
    throw createError({ statusCode: 404, statusMessage: 'Portfolio not found.' })
  }
  return p
}

// Produce a stable, unique-in-org slug from a free-text name. Falls back to
// `portfolio` if the name doesn't produce any safe characters. The caller is
// responsible for collision-checking against the DB.
export function slugifyPortfolioName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base.length >= 2 ? base : 'portfolio'
}

export async function ensureUniqueSlug(
  tx: Transaction<Database>,
  desired: string
): Promise<string> {
  let slug = desired
  let n = 2
  while (true) {
    const existing = await tx
      .selectFrom('context_portfolios')
      .select('id')
      .where('slug', '=', slug)
      .executeTakeFirst()
    if (!existing) return slug
    slug = `${desired}-${n}`
    n++
    if (n > 1000) {
      throw createError({ statusCode: 500, statusMessage: 'Could not generate a unique slug.' })
    }
  }
}
