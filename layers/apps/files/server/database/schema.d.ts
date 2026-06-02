// Module augmentation: extends the host's Database interface with files tables.
import type { ColumnType, Generated } from 'kysely'

// A files item is either an authored markdown `doc` or an uploaded binary
// `file`. Docs carry `body_md` + version history; files carry storage
// metadata and are immutable (re-upload = a new item).
export type FilesItemKind = 'doc' | 'file'

export interface FilesItemsTable {
  id: Generated<string>
  kind: FilesItemKind
  title: string
  // Docs only. The FTS `body_tsv` generated column (title + filename + body)
  // is created in the migration and never referenced from TS — raw SQL only,
  // like messages.
  body_md: string | null
  // Files only.
  storage_key: string | null
  filename: string | null
  mime: string | null
  size_bytes: ColumnType<string | null, string | number | null | undefined, string | number | null>
  // Shared org-level tags (one set everyone sees), GIN-indexed. Deliberately
  // NOT per-user like messages — the library is org-wide.
  tags: Generated<string[]>
  // Public share link. null = no active link; revoke = null it; reissue =
  // overwrite. A UUID so the public route can resolve it via withRecordOrgContext.
  share_token: ColumnType<string | null, string | null | undefined, string | null>
  // Nullable + ON DELETE SET NULL: a library doc/file outlives its creator's
  // account (read paths render `created_by_name ?? 'Unknown'`).
  created_by: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  last_edited_by: string | null
  last_edited_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  deleted_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
}

// Full content snapshot per save (docs). Restore re-saves an old snapshot as
// a new head version — restore is itself an edit.
export interface FilesVersionsTable {
  id: Generated<string>
  item_id: string
  title: string
  content: string
  edited_by: string | null
  edited_at: ColumnType<Date, Date | string | undefined, Date | string>
}

declare module '#core/server/database/schema' {
  interface Database {
    files_items: FilesItemsTable
    files_versions: FilesVersionsTable
  }
}
