// Shared logic for section definitions, reads, and writes. Routes and MCP
// tools call `addSection` / `deleteSection` / `saveSectionContent` so key
// validation, size limits, and version writes stay in one place.

import { sql, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { ContextSectionVersionSource } from '../database/schema'
import { CONTEXT_SECTION_KEYS, slugifySectionTitle } from './section-catalog'
import { getPortfolioSections, type MergedSection } from './section-settings'

export const MAX_SECTION_BYTES = 100 * 1024

export interface SectionRow {
  id: string
  portfolio_id: string
  section_key: string
  content: string
  last_edited_by: string | null
  last_edited_at: Date
}

// A section exists for a portfolio iff it has a definition row.
export async function isKnownSectionKey(
  tx: Transaction<Database>,
  portfolioId: string,
  key: string
): Promise<boolean> {
  const row = await tx
    .selectFrom('context_section_definitions')
    .select('id')
    .where('portfolio_id', '=', portfolioId)
    .where('key', '=', key)
    .executeTakeFirst()
  return !!row
}

export async function requireKnownSection(
  tx: Transaction<Database>,
  portfolioId: string,
  key: string
): Promise<void> {
  if (!(await isKnownSectionKey(tx, portfolioId, key))) {
    throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${key}` })
  }
}

const BUILTIN_KEY_LIST = [...CONTEXT_SECTION_KEYS].join(', ')

// `{ key }` adds a built-in section from the catalog; `{ title }` creates a
// custom section keyed by the slugified title. Custom keys may not collide
// with catalog keys, so the key alone tells the two apart.
export type AddSectionInput
  = { key: string }
    | { title: string, description?: string, order?: number }

export async function addSection(
  tx: Transaction<Database>,
  portfolioId: string,
  input: AddSectionInput,
  userId: string
): Promise<MergedSection> {
  let key: string
  let values: { title?: string, description?: string, order?: number } = {}
  if ('key' in input) {
    if (!CONTEXT_SECTION_KEYS.has(input.key)) {
      throw createError({
        statusCode: 400,
        statusMessage: `"${input.key}" is not a built-in section (built-in keys: ${BUILTIN_KEY_LIST}). Pass a title to create a custom section.`
      })
    }
    key = input.key
  } else {
    key = slugifySectionTitle(input.title)
    if (!key) throw createError({ statusCode: 400, statusMessage: 'Title must contain at least one alphanumeric character.' })
    if (CONTEXT_SECTION_KEYS.has(key)) {
      throw createError({ statusCode: 409, statusMessage: `Key "${key}" collides with a built-in section — add the built-in "${key}" instead.` })
    }
    values = { title: input.title, description: input.description, order: input.order ?? 0 }
  }

  if (await isKnownSectionKey(tx, portfolioId, key)) {
    throw createError({ statusCode: 409, statusMessage: `Section "${key}" already exists in this portfolio.` })
  }

  await tx
    .insertInto('context_section_definitions')
    .values({ portfolio_id: portfolioId, key, ...values, created_by: userId })
    .execute()

  const sections = await getPortfolioSections(tx, portfolioId)
  return sections.find(s => s.key === key)!
}

// Removes the definition row. Content saved under the key stays in
// `context_sections` (with its versions and comments) and resurfaces if a
// section with the same key is added again.
export async function deleteSection(
  tx: Transaction<Database>,
  portfolioId: string,
  key: string
): Promise<{ id: string, is_custom: boolean, content_retained: boolean }> {
  const existing = await tx
    .selectFrom('context_section_definitions')
    .select('id')
    .where('portfolio_id', '=', portfolioId)
    .where('key', '=', key)
    .executeTakeFirst()
  if (!existing) throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${key}` })

  const content = await loadSection(tx, portfolioId, key)
  await tx
    .deleteFrom('context_section_definitions')
    .where('id', '=', existing.id)
    .execute()

  return {
    id: existing.id,
    is_custom: !CONTEXT_SECTION_KEYS.has(key),
    content_retained: (content?.content ?? '').trim().length > 0
  }
}

export async function loadSection(
  tx: Transaction<Database>,
  portfolioId: string,
  key: string
): Promise<SectionRow | null> {
  const row = await tx
    .selectFrom('context_sections')
    .select(['id', 'portfolio_id', 'section_key', 'content', 'last_edited_by', 'last_edited_at'])
    .where('portfolio_id', '=', portfolioId)
    .where('section_key', '=', key)
    .executeTakeFirst()
  return (row as SectionRow | undefined) ?? null
}

export interface SaveSectionOptions {
  // Stamped on the version row so history can show who made the change:
  // 'user' for UI routes, 'assistant' for accepted proposals, 'mcp' for MCP tools.
  source: ContextSectionVersionSource
  enforceKeyExists?: boolean
}

// Atomic upsert + version insert in a single transaction. Returns the updated
// section row plus the new version id.
export async function saveSectionContent(
  tx: Transaction<Database>,
  portfolioId: string,
  key: string,
  content: string,
  userId: string,
  opts: SaveSectionOptions
): Promise<{ section: SectionRow, versionId: string }> {
  if (Buffer.byteLength(content, 'utf8') > MAX_SECTION_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Section content exceeds 100KB limit.' })
  }

  if (opts.enforceKeyExists !== false) {
    const known = await isKnownSectionKey(tx, portfolioId, key)
    if (!known) {
      throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${key}` })
    }
  }

  const existing = await loadSection(tx, portfolioId, key)

  let section: SectionRow
  if (existing) {
    const updated = await tx
      .updateTable('context_sections')
      .set({
        content,
        last_edited_by: userId,
        last_edited_at: sql<Date>`now()`
      })
      .where('id', '=', existing.id)
      .returning(['id', 'portfolio_id', 'section_key', 'content', 'last_edited_by', 'last_edited_at'])
      .executeTakeFirstOrThrow()
    section = updated as SectionRow
  } else {
    const inserted = await tx
      .insertInto('context_sections')
      .values({
        portfolio_id: portfolioId,
        section_key: key,
        content,
        last_edited_by: userId
      })
      .returning(['id', 'portfolio_id', 'section_key', 'content', 'last_edited_by', 'last_edited_at'])
      .executeTakeFirstOrThrow()
    section = inserted as SectionRow
  }

  const version = await tx
    .insertInto('context_section_versions')
    .values({
      section_id: section.id,
      content,
      edited_by: userId,
      source: opts.source
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return { section, versionId: version.id }
}
