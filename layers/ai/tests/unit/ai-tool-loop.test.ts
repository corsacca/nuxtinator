// The provider-agnostic tool loop: resolves tool calls through the handler,
// feeds results back in the OpenAI wire shape, stops on a text answer, and
// forces a text answer once the round cap is hit.
import { describe, it, expect } from 'vitest'
import { runCompletionLoop, type ProviderCall, type ProviderTurn } from '../../server/utils/ai-tool-loop'

const TOOL = { name: 'load', description: 'Load a thing', parameters: { type: 'object', properties: {} } }

function scripted(turns: ProviderTurn[]): { call: ProviderCall, seen: Array<{ messages: unknown[], tools: unknown[] | undefined }> } {
  const seen: Array<{ messages: unknown[], tools: unknown[] | undefined }> = []
  let i = 0
  const call: ProviderCall = async (messages, tools) => {
    seen.push({ messages: [...messages], tools })
    const turn = turns[Math.min(i, turns.length - 1)]!
    i++
    return turn
  }
  return { call, seen }
}

describe('runCompletionLoop', () => {
  it('returns the text answer when the model makes no tool calls', async () => {
    const { call, seen } = scripted([{ text: 'hi', finishReason: 'stop', toolCalls: [] }])
    const res = await runCompletionLoop(call, {
      apiMessages: [{ role: 'user', content: 'hello' }],
      tools: [TOOL],
      onToolCall: async () => 'unused',
      maxToolRounds: 4
    })
    expect(res.text).toBe('hi')
    expect(res.toolCalls).toEqual([])
    expect(seen).toHaveLength(1)
    expect(seen[0]!.tools).toHaveLength(1)
  })

  it('resolves tool calls and appends assistant + tool turns before asking again', async () => {
    const { call, seen } = scripted([
      { text: '', finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'load', arguments: '{"key":"a"}' }] },
      { text: 'done', finishReason: 'stop', toolCalls: [] }
    ])
    const handled: Array<{ name: string, input: Record<string, unknown> }> = []
    const res = await runCompletionLoop(call, {
      apiMessages: [{ role: 'user', content: 'go' }],
      tools: [TOOL],
      onToolCall: async (name, input) => {
        handled.push({ name, input })
        return 'RESULT'
      },
      maxToolRounds: 4
    })
    expect(res.text).toBe('done')
    expect(handled).toEqual([{ name: 'load', input: { key: 'a' } }])
    expect(res.toolCalls).toEqual([{ name: 'load', input: { key: 'a' } }])

    const second = seen[1]!.messages
    expect(second).toHaveLength(3)
    expect(second[1]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'c1', type: 'function' }] })
    expect(second[2]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'RESULT' })
  })

  it('offers no tools once the round cap is reached so the model must answer in text', async () => {
    const toolTurn: ProviderTurn = {
      text: '',
      finishReason: 'tool_calls',
      toolCalls: [{ id: 'c', name: 'load', arguments: '{}' }]
    }
    const { call, seen } = scripted([toolTurn, toolTurn, { text: 'forced', finishReason: 'stop', toolCalls: [] }])
    const res = await runCompletionLoop(call, {
      apiMessages: [],
      tools: [TOOL],
      onToolCall: async () => 'r',
      maxToolRounds: 2
    })
    expect(res.text).toBe('forced')
    expect(res.toolCalls).toHaveLength(2)
    expect(seen.map(s => s.tools === undefined)).toEqual([false, false, true])
  })

  it('offers no tools when no handler is given', async () => {
    const { call, seen } = scripted([{ text: 'x', finishReason: 'stop', toolCalls: [] }])
    await runCompletionLoop(call, { apiMessages: [], tools: [TOOL], maxToolRounds: 4 })
    expect(seen[0]!.tools).toBeUndefined()
  })

  it('passes an empty object for unparseable tool arguments', async () => {
    const { call } = scripted([
      { text: '', finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'load', arguments: 'not json' }] },
      { text: 'ok', finishReason: 'stop', toolCalls: [] }
    ])
    let got: Record<string, unknown> | null = null
    await runCompletionLoop(call, {
      apiMessages: [],
      tools: [TOOL],
      onToolCall: async (_n, input) => {
        got = input
        return ''
      },
      maxToolRounds: 4
    })
    expect(got).toEqual({})
  })
})
