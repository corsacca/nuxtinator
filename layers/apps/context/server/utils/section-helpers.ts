// Shared logic for section reads and writes. Other routes (assistant apply,
// MCP write tools) call `saveSectionContent` so size limits, version writes,
// and key validation stay in one place.

import { sql, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { CONTEXT_SECTION_KEYS } from './section-catalog'

export const MAX_SECTION_BYTES = 100 * 1024

export interface SectionRow {
  id: string
  portfolio_id: string
  section_key: string
  content: string
  last_edited_by: string | null
  last_edited_at: Date
}

export async function isKnownSectionKey(
  tx: Transaction<Database>,
  portfolioId: string,
  key: string
): Promise<boolean> {
  if (CONTEXT_SECTION_KEYS.has(key)) return true
  const customRow = await tx
    .selectFrom('context_custom_section_definitions')
    .select('id')
    .where('portfolio_id', '=', portfolioId)
    .where('key', '=', key)
    .executeTakeFirst()
  return !!customRow
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
  opts: SaveSectionOptions = {}
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
      edited_by: userId
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return { section, versionId: version.id }
}
