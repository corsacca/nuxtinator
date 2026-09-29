import type { ColumnType, Generated } from 'kysely'

// Appearance of one widget. Every field optional in storage — the public
// config fills the defaults (see server/utils/helpinator-widgets.ts).
export interface HelpinatorAppearance {
  primary_color?: string
  position?: 'bottom-right' | 'bottom-left'
  title?: string
  greeting?: string
  placeholder?: string
  handoff_prompt?: string
}

export interface HelpinatorWidgetsTable {
  id: Generated<string>
  name: string
  portfolio_id: string | null
  default_section_key: string
  allowed_origins: Generated<string[]>
  daily_message_cap: Generated<number>
  enabled: Generated<boolean>
  appearance: ColumnType<HelpinatorAppearance, HelpinatorAppearance | string | undefined, HelpinatorAppearance | string>
  extra_instructions: Generated<string>
  created_by: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

// handoff_kind: 'visitor' (self-service "still need help") | 'staff' (manual elevation)
export type HelpinatorHandoffKind = 'visitor' | 'staff'

export interface HelpinatorConversationsTable {
  id: Generated<string>
  widget_id: string
  portfolio_id: string
  session_hash: string
  visitor_email: string | null
  page_url: string | null
  origin: string | null
  user_agent: string | null
  visitor_message_count: Generated<number>
  inbox_conversation_id: string | null
  handoff_kind: HelpinatorHandoffKind | null
  handed_off_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  handed_off_by: string | null
  ended_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  last_message_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface HelpinatorMessagesTable {
  id: Generated<string>
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sections_loaded: ColumnType<string[], string[] | string | undefined, string[] | string>
  model: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

declare global {
  interface NuxtinatorDatabaseTables {
    helpinator_widgets: HelpinatorWidgetsTable
    helpinator_conversations: HelpinatorConversationsTable
    helpinator_messages: HelpinatorMessagesTable
  }
}
