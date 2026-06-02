// Shared logic for files-item reads + doc writes. Routes (PATCH, restore) and
// MCP write tools all call `saveDocContent` so the byte cap and version-row
// insert stay in one place. Mirrors the context layer's `saveSectionContent`.

import { sql, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

export const MAX_DOC_BYTES = 100 * 1024

export interface FilesItemRow {
  id: string
  kind: 'doc' | 'file'
  title: string
  body_md: string | null
  storage_key: string | null
  filename: string | null
  mime: string | null
  size_bytes: string | null
  tags: string[]
  share_token: string | null
  created_by: string
  created_at: Date
  last_edited_by: string | null
  last_edited_at: Date | null
  deleted_at: Date | null
}

const ITEM_COLS = [
  'id', 'kind', 'title', 'body_md', 'storage_key', 'filename', 'mime',
  'size_bytes', 'tags', 'share_token', 'created_by', 'created_at',
  'last_edited_by', 'last_edited_at', 'deleted_at'
] as const

// Load a non-deleted item by id. Returns null when missing/deleted.
export async function loadItem(
  tx: Transaction<Database>,
  id: string
): Promise<FilesItemRow | null> {
  const row = await tx
    .selectFrom('files_items')
    .select(ITEM_COLS)
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  return (row as FilesItemRow | undefined) ?? null
}

// Update a doc's title/body + insert a full-snapshot version, atomically. The
// item must already exist and be a `doc`. Returns the updated row + new
// version id.
export async function saveDocContent(
  tx: Transaction<Database>,
  itemId: string,
  data: { title: string, body_md: string },
  userId: string
): Promise<{ item: FilesItemRow, versionId: string }> {
  if (Buffer.byteLength(data.body_md, 'utf8') > MAX_DOC_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Document content exceeds 100KB limit.' })
  }

  const existing = await loadItem(tx, itemId)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found.' })
  }
  if (existing.kind !== 'doc') {
    throw createError({ statusCode: 400, statusMessage: 'Only documents are editable.' })
  }

  const updated = await tx
    .updateTable('files_items')
    .set({
      title: data.title,
      body_md: data.body_md,
      last_edited_by: userId,
      last_edited_at: sql<Date>`now()`
    })
    .where('id', '=', itemId)
    .returning(ITEM_COLS)
    .executeTakeFirstOrThrow()

  const version = await tx
    .insertInto('files_versions')
    .values({
      item_id: itemId,
      title: data.title,
      content: data.body_md,
      edited_by: userId
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return { item: updated as FilesItemRow, versionId: version.id }
}
