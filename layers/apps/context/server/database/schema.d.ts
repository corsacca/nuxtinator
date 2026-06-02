import type { ColumnType, Generated } from 'kysely'

export interface ContextPortfoliosTable {
  id: Generated<string>
  slug: string
  name: string
  color: string | null
  icon_url: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface ContextSectionsTable {
  id: Generated<string>
  portfolio_id: string
  section_key: string
  content: Generated<string>
  last_edited_by: string | null
  last_edited_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface ContextSectionVersionsTable {
  id: Generated<string>
  section_id: string
  content: string
  edited_by: string | null
  edited_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface ContextCustomSectionDefinitionsTable {
  id: Generated<string>
  portfolio_id: string
  key: string
  title: string
  description: Generated<string>
  order: Generated<number>
  created_by: string
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface ContextSectionCommentsTable {
  id: Generated<string>
  section_id: string
  author_id: string
  quoted_text: string
  anchor_start: number
  anchor_end: number
  anchor_hash: string
  content: string
  is_resolved: Generated<boolean>
  resolved_by: string | null
  resolved_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface ContextSectionCommentRepliesTable {
  id: Generated<string>
  comment_id: string
  author_id: string
  content: string
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

declare module '#core/server/database/schema' {
  interface Database {
    context_portfolios: ContextPortfoliosTable
    context_sections: ContextSectionsTable
    context_section_versions: ContextSectionVersionsTable
    context_custom_section_definitions: ContextCustomSectionDefinitionsTable
    context_section_comments: ContextSectionCommentsTable
    context_section_comment_replies: ContextSectionCommentRepliesTable
  }
}
