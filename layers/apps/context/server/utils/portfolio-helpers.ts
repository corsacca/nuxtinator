// Portfolio-scoped lookups and access guards. Used by every route that
// addresses a single portfolio by slug.
//
// The tenant transaction already restricts visibility to the active org (RLS
// in multi mode, no-op in single). Inside it `lookupBySlug` is a plain
// SELECT — no extra `org_id` filter needed.

import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { CONTEXT_SECTIONS, CONTEXT_SECTION_KEYS } from './section-catalog'

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

export async function getPortfolioById(
  tx: Transaction<Database>,
  id: string
): Promise<PortfolioRow | null> {
  const row = await tx
    .selectFrom('context_portfolios')
    .select(['id', 'slug', 'name', 'color', 'icon_url', 'created_at', 'updated_at'])
    .where('id', '=', id)
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

export interface CreatePortfolioInput {
  name: string
  color?: string | null
  slug?: string
  // Built-in section keys the portfolio starts with. Omitted = every catalog
  // section; [] = none. Sections can be added or removed afterwards.
  builtin_sections?: string[]
}

// Inserts the portfolio and one definition row per chosen built-in section.
// The catalog is the template applied here; it is not consulted again for
// existing portfolios.
export async function createPortfolio(
  tx: Transaction<Database>,
  input: CreatePortfolioInput,
  userId: string
): Promise<PortfolioRow> {
  const keys = input.builtin_sections === undefined
    ? CONTEXT_SECTIONS.map(s => s.key)
    : [...new Set(input.builtin_sections)]
  const unknown = keys.filter(k => !CONTEXT_SECTION_KEYS.has(k))
  if (unknown.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unknown built-in section(s): ${unknown.join(', ')}. Valid keys: ${[...CONTEXT_SECTION_KEYS].join(', ')}.`
    })
  }

  const slug = await ensureUniqueSlug(tx, input.slug ?? slugifyPortfolioName(input.name))
  const inserted = await tx
    .insertInto('context_portfolios')
    .values({ slug, name: input.name, color: input.color ?? null })
    .returning(['id', 'slug', 'name', 'color', 'icon_url', 'created_at', 'updated_at'])
    .executeTakeFirstOrThrow()

  if (keys.length > 0) {
    await tx
      .insertInto('context_section_definitions')
      .values(keys.map(key => ({ portfolio_id: inserted.id, key, created_by: userId })))
      .execute()
  }

  return inserted as PortfolioRow
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
