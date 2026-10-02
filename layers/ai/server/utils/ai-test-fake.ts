// The VITEST stand-in for the OpenRouter network boundary. `complete()` and
// `generate()` route here whenever `process.env.VITEST` is set, so suites run
// without a key. Tests script the next answers over the control endpoint
// (`/api/_test/ai`, see server/routes/api/_test/ai.ts) and read back a log of
// every call the fake served, including the tool calls it made through the
// caller's `onToolCall` handler.
//
// State lives on a global symbol rather than in module scope: Nitro imports
// routes lazily, so the control route and the client may not share a module
// instance.
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import type {
  AiCompleteOptions,
  AiCompleteResult,
  AiEmbedOptions,
  AiEmbedResult,
  AiGenerateOptions,
  AiGenerateResult,
  AiToolCallRecord
} from '#core/ai-fallback/types'
import { AI_EMBED_DIMENSIONS } from '#core/ai-fallback/vectors'

export interface AiFakeScript {
  // Text `complete()` returns. Default: `[[stub:<model>]]`.
  text?: string
  // Tool calls the fake makes (through the caller's `onToolCall`) before
  // returning `text`. Each call's result is captured in the log.
  toolCalls?: AiToolCallRecord[]
  // Parsed tool input `generate()` returns. Default: a schema-shaped stub that
  // fills every declared property with a value of the right JSON type.
  generateInput?: Record<string, unknown>
  // Text a streaming `complete()` receives before the tool calls and then
  // discards, exercising a consumer's `onTextDiscard`. Needs `toolCalls`.
  discardedText?: string
  // `complete()` waits this long before answering, like a slow model, so a
  // suite can observe what the caller holds open during a turn.
  delayMs?: number
  // Same for each `embed()` call.
  embedDelayMs?: number
}

export interface AiFakeToolResult extends AiToolCallRecord {
  result: string
}

export interface AiFakeCall {
  kind: 'complete' | 'generate' | 'embed'
  model: string
  system: AiCompleteOptions['system']
  messages: AiCompleteOptions['messages']
  // Names of the tools the caller offered.
  tools: string[]
  toolResults: AiFakeToolResult[]
  // Whether the caller asked for text as it arrives.
  streamed?: boolean
  // For `embed`: the strings embedded.
  input?: string[]
}

interface AiFakeState {
  script: AiFakeScript
  log: AiFakeCall[]
}

const STATE_KEY = Symbol.for('nuxtinator.ai.test-fake')

function getState(): AiFakeState {
  const g = globalThis as Record<symbol, unknown>
  if (!g[STATE_KEY]) g[STATE_KEY] = { script: {}, log: [] } satisfies AiFakeState
  return g[STATE_KEY] as AiFakeState
}

// Script the fake's next answers. Persists until `resetAiFake()`.
export function primeAiFake(script: AiFakeScript): void {
  getState().script = { ...script }
}

export function getAiFakeLog(): AiFakeCall[] {
  return [...getState().log]
}

export function resetAiFake(): void {
  const s = getState()
  s.script = {}
  s.log = []
}

// `model` is the id the client resolved for the call's feature; the fake
// records it so a suite can assert which model a feature ran on.
// Word-sized fragments, so a streaming consumer's reassembly is exercised.
function fakeDeltas(text: string): string[] {
  return text.match(/\S+\s*/g) ?? []
}

// A streaming call sees the same sequence a real one would: any discarded
// preface, the tool calls, the discard, then the reply word by word.
export async function aiFakeComplete(opts: AiCompleteOptions, model: string): Promise<AiCompleteResult> {
  const state = getState()
  const entry: AiFakeCall = {
    kind: 'complete',
    model,
    system: opts.system,
    messages: opts.messages,
    tools: (opts.tools ?? []).map(t => t.name),
    toolResults: [],
    streamed: !!opts.onTextDelta
  }
  const scriptedCalls = opts.onToolCall ? state.script.toolCalls ?? [] : []
  const preface = opts.onTextDelta && scriptedCalls.length ? state.script.discardedText ?? '' : ''
  for (const delta of fakeDeltas(preface)) opts.onTextDelta!(delta)

  const toolCalls: AiToolCallRecord[] = []
  for (const tc of scriptedCalls) {
    const result = await opts.onToolCall!(tc.name, tc.input)
    entry.toolResults.push({ ...tc, result })
    toolCalls.push(tc)
  }
  if (preface) opts.onTextDiscard?.()
  if (state.script.delayMs) await new Promise(r => setTimeout(r, state.script.delayMs))

  const text = state.script.text ?? `[[stub:${model}]]`
  if (opts.onTextDelta) {
    for (const delta of fakeDeltas(text)) opts.onTextDelta(delta)
  }
  state.log.push(entry)
  return { text, model, finishReason: 'stop', toolCalls }
}

export function aiFakeGenerate<T>(opts: AiGenerateOptions, model: string): AiGenerateResult<T> {
  const state = getState()
  state.log.push({
    kind: 'generate',
    model,
    system: opts.system,
    messages: opts.messages,
    tools: [opts.tool.name],
    toolResults: []
  })
  const input = (state.script.generateInput ?? stubToolInput(opts)) as T
  return { input, model, finishReason: 'tool_calls' }
}

// Deterministic schema-shaped stub: fills each declared property with a value
// of the right JSON type so a consumer's `required` fields are present.
function stubToolInput(opts: AiGenerateOptions): Record<string, unknown> {
  const schema = opts.tool.parameters as { properties?: Record<string, { type?: string }> }
  const props = schema.properties ?? {}
  const out: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(props)) {
    switch (spec?.type) {
      case 'number':
      case 'integer':
        out[key] = 0
        break
      case 'boolean':
        out[key] = false
        break
      case 'array':
        out[key] = []
        break
      case 'object':
        out[key] = {}
        break
      default:
        out[key] = `stub-${key}`
    }
  }
  return out
}

// Deterministic embeddings so similarity tests are stable: identical text →
// identical vector; texts sharing words → closer vectors. Each word hashes to
// a handful of dimensions (a bag-of-words projection), normalised to unit
// length. `[[fail]]` anywhere in an input makes the call throw, so consumers'
// failure paths can be exercised.
export function aiFakeEmbedVector(text: string): number[] {
  const v = new Array<number>(AI_EMBED_DIMENSIONS).fill(0)
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  for (const w of words) {
    const h = createHash('sha256').update(w).digest()
    for (let i = 0; i < 4; i++) {
      const idx = h.readUInt16BE(i * 2) % AI_EMBED_DIMENSIONS
      v[idx] = v[idx]! + 1
    }
  }
  const norm = Math.sqrt(v.reduce((s, n) => s + n * n, 0)) || 1
  return v.map(n => n / norm)
}

export async function aiFakeEmbed(opts: AiEmbedOptions, model: string): Promise<AiEmbedResult> {
  const state = getState()
  state.log.push({ kind: 'embed', model, system: undefined, messages: [], tools: [], toolResults: [], input: [...opts.input] })
  if (opts.input.some(t => t.includes('[[fail]]'))) {
    throw createError({ statusCode: 502, statusMessage: 'The AI provider is busy. Try again in a moment.' })
  }
  if (state.script.embedDelayMs) await new Promise(r => setTimeout(r, state.script.embedDelayMs))
  return { vectors: opts.input.map(aiFakeEmbedVector), model }
}
