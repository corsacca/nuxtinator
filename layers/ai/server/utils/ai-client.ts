import { createError } from 'h3'
import type {
  AiCompleteOptions,
  AiCompleteResult,
  AiContent,
  AiGenerateOptions,
  AiGenerateResult,
  AiMessage,
  AiTextPart
} from '#core/ai-fallback/types'
import { supportsTemperature } from './ai-models'
import { runCompletionLoop, type ProviderCall } from './ai-tool-loop'
import { aiFakeComplete, aiFakeGenerate } from './ai-test-fake'

// OpenRouter client. OpenRouter is OpenAI-compatible, so this is a plain fetch
// to `${baseUrl}/chat/completions` — no SDK, sidestepping the `@anthropic-ai/sdk`
// bundling caveats. `complete()` returns assistant text, resolving any tool
// calls the model makes through the caller's handler (see ai-tool-loop.ts);
// `generate()` forces a single tool call and returns its parsed arguments as
// structured output.
//
// Under VITEST both route to the primeable fake in ai-test-fake.ts instead of
// the network.
//
// Error contract (consumers branch on these): 503 = not configured; 502 =
// transient upstream (retry); 500 = auth/other misconfig (check server logs).
// The raw provider message is never forwarded to the client.

interface OpenRouterConfig {
  apiKey: string
  baseUrl: string
  referer: string
  title: string
}

function getConfig(): OpenRouterConfig {
  const c = useRuntimeConfig()
  return {
    apiKey: (c.openrouterApiKey as string) || process.env.OPENROUTER_API_KEY || '',
    baseUrl: ((c.openrouterBaseUrl as string) || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    referer: (c.aiHttpReferer as string) || '',
    title: (c.aiAppTitle as string) || ''
  }
}

// Whether live generation is possible. Under VITEST it's always "configured" so
// suites run without a key — the network boundary is stubbed below.
export function isAiConfigured(): boolean {
  if (process.env.VITEST) return true
  return !!getConfig().apiKey
}

// Our content model → OpenAI-compatible content. A parts array becomes the
// content-parts form, forwarding Anthropic `cache_control` on parts flagged
// cacheable (a no-op on non-caching models).
function toApiContent(content: AiContent): unknown {
  if (typeof content === 'string') return content
  return content.map((p: AiTextPart) => ({
    type: 'text',
    text: p.text,
    ...(p.cache ? { cache_control: { type: 'ephemeral' } } : {})
  }))
}

function toApiMessages(system: AiContent | undefined, messages: AiMessage[]): unknown[] {
  const out: unknown[] = []
  if (system !== undefined) out.push({ role: 'system', content: toApiContent(system) })
  for (const m of messages) out.push({ role: m.role, content: toApiContent(m.content) })
  return out
}

function buildBody(
  model: string,
  apiMessages: unknown[],
  maxTokens: number,
  temperature: number | undefined,
  extra: Record<string, unknown>
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: apiMessages,
    max_tokens: maxTokens
  }
  // Only send sampling params to models that accept them — some models 400 on
  // an unrecognised `temperature`.
  if (temperature !== undefined && supportsTemperature(model)) {
    body.temperature = temperature
  }
  return { ...body, ...extra }
}

async function callOpenRouter(body: Record<string, unknown>): Promise<any> {
  const cfg = getConfig()
  if (!cfg.apiKey) {
    throw createError({ statusCode: 503, statusMessage: 'AI is not configured (OPENROUTER_API_KEY missing).' })
  }

  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        ...(cfg.referer ? { 'HTTP-Referer': cfg.referer } : {}),
        ...(cfg.title ? { 'X-Title': cfg.title } : {})
      },
      body: JSON.stringify(body)
    })
  } catch {
    // Network/connection failure — retryable.
    throw createError({
      statusCode: 502,
      statusMessage: 'AI request failed to reach the provider. Try again in a moment.'
    })
  }

  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 500)
    } catch {
      // ignore — the status alone drives the mapping
    }
    if (!process.env.VITEST) {
      console.error(`[ai] OpenRouter ${res.status}: ${detail}`)
    }
    if (res.status === 429 || res.status >= 500) {
      throw createError({ statusCode: 502, statusMessage: 'The AI provider is busy. Try again in a moment.' })
    }
    if (res.status === 401 || res.status === 403) {
      throw createError({ statusCode: 500, statusMessage: 'AI provider auth failed — check the server logs.' })
    }
    throw createError({ statusCode: 500, statusMessage: 'AI request was rejected — check the server logs.' })
  }

  return res.json()
}

// One chat-completions round trip in the shape the tool loop consumes.
function providerCall(model: string, maxTokens: number, temperature: number | undefined): ProviderCall {
  return async (apiMessages, apiTools) => {
    const data = await callOpenRouter(
      buildBody(model, apiMessages, maxTokens, temperature, apiTools ? { tools: apiTools } : {})
    )
    const choice = data.choices?.[0]
    const finishReason: string = choice?.finish_reason ?? 'stop'
    if (finishReason === 'length') {
      throw createError({ statusCode: 502, statusMessage: 'The AI response was cut off. Try again.' })
    }
    const rawCalls: any[] = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls : []
    return {
      text: String(choice?.message?.content ?? '').trim(),
      finishReason,
      toolCalls: rawCalls.map(tc => ({
        id: String(tc.id ?? ''),
        name: String(tc.function?.name ?? ''),
        arguments: String(tc.function?.arguments ?? '')
      }))
    }
  }
}

export async function complete(opts: AiCompleteOptions): Promise<AiCompleteResult> {
  if (process.env.VITEST) return aiFakeComplete(opts)

  const result = await runCompletionLoop(
    providerCall(opts.model, opts.maxTokens ?? 2048, opts.temperature),
    {
      apiMessages: toApiMessages(opts.system, opts.messages),
      tools: opts.tools,
      onToolCall: opts.onToolCall,
      maxToolRounds: opts.maxToolRounds ?? 4
    }
  )
  return { ...result, model: opts.model }
}

// Force the model to call `opts.tool` and return its parsed arguments. A
// truncated forced-tool response comes back as partial JSON (not an error), so
// the `length` finish-reason is checked explicitly before parsing.
export async function generate<T = Record<string, unknown>>(
  opts: AiGenerateOptions
): Promise<AiGenerateResult<T>> {
  if (process.env.VITEST) return aiFakeGenerate<T>(opts)

  const body = buildBody(opts.model, toApiMessages(opts.system, opts.messages), opts.maxTokens ?? 8192, opts.temperature, {
    tools: [
      {
        type: 'function',
        function: {
          name: opts.tool.name,
          description: opts.tool.description,
          parameters: opts.tool.parameters
        }
      }
    ],
    tool_choice: { type: 'function', function: { name: opts.tool.name } }
  })

  const data = await callOpenRouter(body)
  const choice = data.choices?.[0]
  const finishReason: string = choice?.finish_reason ?? 'stop'
  if (finishReason === 'length') {
    throw createError({
      statusCode: 502,
      statusMessage: 'The AI response was cut off before finishing. Try again.'
    })
  }
  if (finishReason === 'content_filter') {
    throw createError({ statusCode: 502, statusMessage: 'The AI provider refused the request.' })
  }

  const args = choice?.message?.tool_calls?.[0]?.function?.arguments
  if (!args) {
    throw createError({ statusCode: 502, statusMessage: 'The AI did not return a structured result. Try again.' })
  }
  let input: T
  try {
    input = JSON.parse(args)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'The AI returned an unparseable result. Try again.' })
  }
  return { input, model: opts.model, finishReason }
}
