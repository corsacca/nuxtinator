import type { ColumnType, Generated } from 'kysely'

export type FeedbackPostType = 'task' | 'feature' | 'bug' | 'artifact' | 'feedback'
export type FeedbackAttachmentKind = 'screenshot' | 'attachment'

export interface ProjectsTable {
  id: Generated<string>
  name: string
  description: string | null
  is_expanded: Generated<boolean>
  post_meta: Generated<Record<string, any>>
  created_at: ColumnType<Date, string | Date | undefined, string | Date>
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>
}

export interface ColumnsTable {
  id: Generated<string>
  name: string
  position: number
  wip_limit: number | null
  is_collapsed: Generated<boolean>
  post_meta: Generated<Record<string, any>>
  created_at: ColumnType<Date, string | Date | undefined, string | Date>
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>
}

export interface SwimlanesTable {
  id: Generated<string>
  project_id: string
  name: string
  is_default: Generated<boolean>
  position: Generated<number>
  post_meta: Generated<Record<string, any>>
  created_at: ColumnType<Date, string | Date | undefined, string | Date>
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>
}

export interface CardsTable {
  id: Generated<string>
  project_id: string
  swimlane_id: string
  column_id: string | null
  title: Generated<string>
  post_type: Generated<FeedbackPostType>
  description: string | null
  assignee: string | null
  start_date: ColumnType<Date | string | null, string | Date | null | undefined, string | Date | null>
  due_date: ColumnType<Date | string | null, string | Date | null | undefined, string | Date | null>
  priority: string | null
  is_done: Generated<boolean>
  testing_results: string | null
  post_meta: Generated<Record<string, any>>
  last_moved_at: ColumnType<Date, string | Date | undefined, string | Date>
  created_at: ColumnType<Date, string | Date | undefined, string | Date>
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>
}

export interface CardColumnHistoryTable {
  id: Generated<string>
  card_id: string
  column_id: string | null
  moved_at: ColumnType<Date, string | Date | undefined, string | Date>
}

export interface FeedbackAttachmentsTable {
  id: Generated<string>
  card_id: string
  kind: FeedbackAttachmentKind
  storage_key: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: ColumnType<Date, string | Date | undefined, string | Date>
}

declare module '#core/server/database/schema' {
  interface Database {
    projects: ProjectsTable
    columns: ColumnsTable
    swimlanes: SwimlanesTable
    cards: CardsTable
    card_column_history: CardColumnHistoryTable
    feedback_attachments: FeedbackAttachmentsTable
  }
}
