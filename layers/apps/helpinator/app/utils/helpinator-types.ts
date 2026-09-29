export interface HelpinatorAppearanceForm {
  primary_color: string
  position: 'bottom-right' | 'bottom-left'
  title: string
  greeting: string
  placeholder: string
  handoff_prompt: string
}

export interface HelpinatorWidget {
  id: string
  name: string
  portfolio_id: string | null
  default_section_key: string
  allowed_origins: string[]
  daily_message_cap: number
  enabled: boolean
  appearance: HelpinatorAppearanceForm
  extra_instructions: string
  created_at: string
  updated_at: string
}

export interface HelpinatorPortfolioOption {
  id: string
  slug: string
  name: string
  sections: { key: string, title: string, description: string }[]
}

export interface HelpinatorConversationSummary {
  id: string
  widget_id: string
  widget_name: string | null
  visitor_email: string | null
  page_url: string | null
  origin: string | null
  user_agent: string | null
  visitor_message_count: number
  inbox_conversation_id: string | null
  handoff_kind: 'visitor' | 'staff' | null
  handed_off_at: string | null
  ended_at: string | null
  created_at: string
  last_message_at: string
  first_question?: string | null
}

export interface HelpinatorTranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  model: string | null
  created_at: string
  sections_loaded: { key: string, title: string }[]
}

export function helpinatorErrorMessage(err: unknown): string {
  const e = err as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string }
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || 'Something went wrong.'
}
