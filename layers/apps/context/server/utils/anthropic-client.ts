// Anthropic client adapter. Production calls `@anthropic-ai/sdk`. Tests swap
// in a fake via `setAnthropicClient()` from the test rig. The interface is
// intentionally narrow — one `call({ messages, system?, tools?, handleTool? })`
// method that handles the tool-use loop internally and returns the final
// assistant text. Anything richer (streaming, citations) can be added
// behind the same surface without callers changing.

import Anthropic from '@anthropic-ai/sdk'

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

type SdkMessage = Anthropic.MessageParam

export interface AnthropicToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface AnthropicCallOpts {
  messages: AssistantMessage[]
  system?: string
  tools?: AnthropicToolDef[]
  handleTool?: (name: string, input: Record<string, unknown>) => Promise<string> | string
  maxIterations?: number
}

export interface AnthropicClient {
  call(opts: AnthropicCallOpts): Promise<string>
}

const realAnthropicClient: AnthropicClient = {
  async call(opts) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw createError({ statusCode: 503, statusMessage: 'ANTHROPIC_API_KEY is not configured.' })
    }
    const client = new Anthropic({ apiKey })

    const messages: SdkMessage[] = opts.messages.map(m => ({ role: m.role, content: m.content }))
    const tools = opts.tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema
    }))

    const maxIterations = opts.maxIterations ?? 6
    for (let i = 0; i < maxIterations; i++) {
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: opts.system,
        messages,
        ...(tools ? { tools } : {})
      })

      // Collect text blocks for the eventual reply.
      const textParts: string[] = []
      const toolUseBlocks: Array<{ id: string, name: string, input: Record<string, unknown> }> = []
      for (const block of response.content) {
        if (block.type === 'text') textParts.push(block.text)
        else if (block.type === 'tool_use') {
          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: (block.input as Record<string, unknown>) ?? {}
          })
        }
      }

      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0 || !opts.handleTool) {
        return textParts.join('\n').trim()
      }

      // Echo assistant's content back as proper content blocks, then resolve
      // each tool call as a `tool_result` content block.
      messages.push({ role: 'assistant', content: response.content })
      const toolResultContent: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUseBlocks) {
        const r = await opts.handleTool(tu.name, tu.input)
        toolResultContent.push({ type: 'tool_result', tool_use_id: tu.id, content: r })
      }
      messages.push({ role: 'user', content: toolResultContent })
    }
    return ''
  }
}

let _client: AnthropicClient = realAnthropicClient

export function getAnthropicClient(): AnthropicClient {
  return _client
}

export function setAnthropicClient(client: AnthropicClient): void {
  _client = client
}

export function resetAnthropicClient(): void {
  _client = realAnthropicClient
}

export { ANTHROPIC_MODEL }
