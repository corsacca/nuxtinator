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

// How a version came to be: a direct edit by the user, an accepted in-app
// assistant proposal, or an AI client writing through MCP.
export type ContextSectionVersionSource = 'user' | 'assistant' | 'mcp'

export interface ContextSectionVersionsTable {
  id: Generated<string>
  section_id: string
  content: string
  edited_by: string | null
  edited_at: ColumnType<Date, Date | string | undefined, Date | string>
  source: ContextSectionVersionSource | null
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

export type ContextAssistantProposalStatus = 'pending' | 'applied' | 'rejected'

// One section update the assistant proposed in a message. Stored as JSON on
// the message so it can be applied or rejected later; `status` records the
// user's decision.
export interface ContextAssistantProposal {
  portfolio_slug: string
  portfolio_name: string
  section_key: string
  section_title: string
  current_content: string
  proposed_content: string
  status: ContextAssistantProposalStatus
}

export interface ContextAssistantConversationsTable {
  id: Generated<string>
  user_id: string
  portfolio_id: string | null
  section_key: string | null
  title: Generated<string>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface ContextAssistantMessagesTable {
  id: Generated<string>
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  proposals: Generated<ContextAssistantProposal[]>
  context_loaded: Generated<string[]>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

declare global {
  interface NuxtinatorDatabaseTables {
    context_portfolios: ContextPortfoliosTable
    context_sections: ContextSectionsTable
    context_section_versions: ContextSectionVersionsTable
    context_custom_section_definitions: ContextCustomSectionDefinitionsTable
    context_section_comments: ContextSectionCommentsTable
    context_section_comment_replies: ContextSectionCommentRepliesTable
    context_assistant_conversations: ContextAssistantConversationsTable
    context_assistant_messages: ContextAssistantMessagesTable
  }
}
