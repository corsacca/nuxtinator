// Shared type surface for the `#ai/server` alias. Canonical here in core so the
// throwing fallback (ai-fallback/ai.ts) and the real `@nuxtinator/ai`
// implementation expose one identical, drift-proof interface — the same reason
// `#core/server/utils/email-templates` owns the email option types both the
// fallback and the mailgun backend build against.
//
// Pure types only (no runtime exports), and deliberately outside `server/utils/`
// so Nuxt's auto-import scan ignores it while `#core/ai-fallback/types` stays
// importable from the AI layer.

import type { Kysely, Transaction } from 'kysely'
import type { Database } from '../server/database/schema'

export type AiDbClient = Kysely<Database> | Transaction<Database>

// One slice of prompt content. Splitting content into parts lets a large,
// byte-stable prefix be marked cacheable: OpenRouter forwards Anthropic
// `cache_control` to caching-capable models and silently ignores it elsewhere,
// so `cache: true` is a no-op on models that don't support prompt caching.
export interface AiTextPart {
  type: 'text'
  text: string
  // Mark this part (and everything before it) as a prompt-cache breakpoint on
  // caching-capable models. No-op elsewhere.
  cache?: boolean
}

export type AiContent = string | AiTextPart[]

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: AiContent
}

// A single tool the model may — or, for `generate`, must — call. `parameters`
// is a JSON Schema object describing the tool's arguments (the structured
// output).
export interface AiTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

// Resolves one tool call the model made during `complete`. The returned string
// is fed back to the model as the tool result.
export type AiToolHandler = (name: string, input: Record<string, unknown>) => Promise<string> | string

export interface AiToolCallRecord {
  name: string
  input: Record<string, unknown>
}

export interface AiCompleteOptions {
  model: string
  system?: AiContent
  messages: AiMessage[]
  maxTokens?: number
  temperature?: number
  // Tools the model may call. Each call is resolved through `onToolCall` and
  // its result appended to the conversation before the model is asked again.
  // After `maxToolRounds` rounds (default 4) one final call runs without tools
  // so the model must answer in text.
  tools?: AiTool[]
  onToolCall?: AiToolHandler
  maxToolRounds?: number
}

export interface AiCompleteResult {
  text: string
  model: string
  finishReason: string
  // Tool calls resolved while producing this answer, in order.
  toolCalls: AiToolCallRecord[]
}

export interface AiGenerateOptions {
  model: string
  system?: AiContent
  messages: AiMessage[]
  // The one tool the model is forced to call; its parsed arguments are returned
  // as the structured `input`.
  tool: AiTool
  maxTokens?: number
  temperature?: number
}

export interface AiGenerateResult<T = Record<string, unknown>> {
  input: T
  model: string
  finishReason: string
}

// One entry in the code-owned model catalog.
export interface AiModelCatalogEntry {
  // OpenRouter model slug, e.g. 'anthropic/claude-sonnet-4.5'.
  id: string
  label: string
  // Whether the model accepts sampling params (temperature). Some newer models
  // reject them with a hard error; guard per model rather than always sending.
  supportsTemperature: boolean
  // Whether the model honours Anthropic prompt caching via `cache_control`.
  supportsCaching: boolean
  // Whether this entry is enabled before any admin override.
  defaultEnabled: boolean
}

// A model as surfaced to admin / per-feature selectors: catalog metadata plus
// whether it came from the code catalog or was added by an admin as a custom id.
export interface AiModelInfo {
  id: string
  label: string
  supportsTemperature: boolean
  supportsCaching: boolean
  custom: boolean
}

// A capability a consumer layer wants an admin-selectable model for (e.g. inbox
// draft replies). Registered at boot via `registerAiFeature`; the admin UI lists
// each and lets an operator pick which enabled model powers it.
export interface AiFeature {
  // Stable key, namespaced by the owning layer, e.g. 'inbox.draft'.
  key: string
  label: string
  description?: string
}
