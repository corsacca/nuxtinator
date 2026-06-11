// Shared logic for files-item reads + doc/site writes. Routes (PATCH,
// restore) and MCP write tools all call `saveDocContent` so the byte cap and
// version-row insert stay in one place. Mirrors the context layer's
// `saveSectionContent`.

import { sql, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

export const MAX_DOC_BYTES = 100 * 1024
// Sites get a larger cap: self-contained HTML pages often inline images as
// base64 data URIs. Their bodies are excluded from FTS (see the
// files_003 migration), so the tsvector size limit doesn't constrain them.
export const MAX_SITE_BYTES = 2 * 1024 * 1024

// Kinds whose body_md is edited in-app and snapshotted into files_versions.
export type EditableKind = 'doc' | 'site'

export function maxBodyBytes(kind: EditableKind): number {
  return kind === 'site' ? MAX_SITE_BYTES : MAX_DOC_BYTES
}

export function bodyLimitMessage(kind: EditableKind): string {
  return kind === 'site'
    ? 'Site content exceeds 2MB limit.'
    : 'Document content exceeds 100KB limit.'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Guard a path-param id before it hits a uuid column (a non-UUID would throw a
// 22P02 cast error → 500). Returns 404 instead.
export function requireUuid(id: string, message = 'Not found.'): void {
  if (!UUID_RE.test(id)) {
    throw createError({ statusCode: 404, statusMessage: message })
  }
}

// Normalize a free-form tags input into a trimmed, de-duplicated string[].
// Shared by the create/patch routes and the multipart upload parser.
export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return [...new Set(
    tags.filter(t => typeof t === 'string').map(t => (t as string).trim()).filter(Boolean)
  )]
}

export interface FilesItemRow {
  id: string
  kind: 'doc' | 'file' | 'site'
  title: string
  body_md: string | null
  storage_key: string | null
  filename: string | null
  mime: string | null
  size_bytes: string | null
  tags: string[]
  share_token: string | null
  created_by: string | null
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
  requireUuid(id)
  const row = await tx
    .selectFrom('files_items')
    .select(ITEM_COLS)
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  return (row as FilesItemRow | undefined) ?? null
}

// Update an editable item's (doc or site) title/body + insert a full-snapshot
// version, atomically. The item must already exist and be an editable kind.
// Returns the updated row + new version id.
export async function saveDocContent(
  tx: Transaction<Database>,
  itemId: string,
  data: { title: string, body_md: string },
  userId: string
): Promise<{ item: FilesItemRow, versionId: string }> {
  const existing = await loadItem(tx, itemId)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found.' })
  }
  if (existing.kind === 'file') {
    throw createError({ statusCode: 400, statusMessage: 'Uploaded files are not editable.' })
  }

  if (Buffer.byteLength(data.body_md, 'utf8') > maxBodyBytes(existing.kind)) {
    throw createError({ statusCode: 413, statusMessage: bodyLimitMessage(existing.kind) })
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
