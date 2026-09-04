// Provider-agnostic tool-call loop for `complete()`. Pure: the provider round
// trip is injected, so the loop is unit-testable without a key or a network.
// Speaks the OpenAI-compatible wire shape (`tool_calls` on the assistant turn,
// `role: 'tool'` results keyed by `tool_call_id`) that OpenRouter accepts for
// every model.
import type { AiTool, AiToolHandler, AiToolCallRecord } from '#core/ai-fallback/types'

export interface ProviderToolCall {
  id: string
  name: string
  // Raw JSON string of the call's arguments, as the provider returns it.
  arguments: string
}

export interface ProviderTurn {
  text: string
  finishReason: string
  toolCalls: ProviderToolCall[]
}

// One provider round trip: the full message list so far plus the tool
// definitions to offer (undefined = offer none).
export type ProviderCall = (apiMessages: unknown[], apiTools: unknown[] | undefined) => Promise<ProviderTurn>

export interface CompletionLoopOptions {
  apiMessages: unknown[]
  tools?: AiTool[]
  onToolCall?: AiToolHandler
  maxToolRounds: number
}

export interface CompletionLoopResult {
  text: string
  finishReason: string
  toolCalls: AiToolCallRecord[]
}

export function toApiTool(tool: AiTool): unknown {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export async function runCompletionLoop(
  call: ProviderCall,
  opts: CompletionLoopOptions
): Promise<CompletionLoopResult> {
  const messages = [...opts.apiMessages]
  const apiTools = opts.tools?.length && opts.onToolCall ? opts.tools.map(toApiTool) : undefined
  const resolved: AiToolCallRecord[] = []

  for (let round = 0; ; round++) {
    // Past the round cap the model is called without tools, which forces a
    // text answer instead of another round of loading.
    const offerTools = apiTools !== undefined && round < opts.maxToolRounds
    const turn = await call(messages, offerTools ? apiTools : undefined)

    if (!offerTools || turn.toolCalls.length === 0) {
      return { text: turn.text, finishReason: turn.finishReason, toolCalls: resolved }
    }

    messages.push({
      role: 'assistant',
      content: turn.text || null,
      tool_calls: turn.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments || '{}' }
      }))
    })

    for (const tc of turn.toolCalls) {
      const input = parseToolArguments(tc.arguments)
      const result = await opts.onToolCall!(tc.name, input)
      resolved.push({ name: tc.name, input })
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
    }
  }
}
