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
import type {
  AiCompleteOptions,
  AiCompleteResult,
  AiGenerateOptions,
  AiGenerateResult,
  AiToolCallRecord
} from '#core/ai-fallback/types'

export interface AiFakeScript {
  // Text `complete()` returns. Default: `[[stub:<model>]]`.
  text?: string
  // Tool calls the fake makes (through the caller's `onToolCall`) before
  // returning `text`. Each call's result is captured in the log.
  toolCalls?: AiToolCallRecord[]
  // Parsed tool input `generate()` returns. Default: a schema-shaped stub that
  // fills every declared property with a value of the right JSON type.
  generateInput?: Record<string, unknown>
}

export interface AiFakeToolResult extends AiToolCallRecord {
  result: string
}

export interface AiFakeCall {
  kind: 'complete' | 'generate'
  model: string
  system: AiCompleteOptions['system']
  messages: AiCompleteOptions['messages']
  // Names of the tools the caller offered.
  tools: string[]
  toolResults: AiFakeToolResult[]
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

export async function aiFakeComplete(opts: AiCompleteOptions): Promise<AiCompleteResult> {
  const state = getState()
  const entry: AiFakeCall = {
    kind: 'complete',
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    tools: (opts.tools ?? []).map(t => t.name),
    toolResults: []
  }
  const toolCalls: AiToolCallRecord[] = []
  if (opts.onToolCall) {
    for (const tc of state.script.toolCalls ?? []) {
      const result = await opts.onToolCall(tc.name, tc.input)
      entry.toolResults.push({ ...tc, result })
      toolCalls.push(tc)
    }
  }
  state.log.push(entry)
  return {
    text: state.script.text ?? `[[stub:${opts.model}]]`,
    model: opts.model,
    finishReason: 'stop',
    toolCalls
  }
}

export function aiFakeGenerate<T>(opts: AiGenerateOptions): AiGenerateResult<T> {
  const state = getState()
  state.log.push({
    kind: 'generate',
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    tools: [opts.tool.name],
    toolResults: []
  })
  const input = (state.script.generateInput ?? stubToolInput(opts)) as T
  return { input, model: opts.model, finishReason: 'tool_calls' }
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
