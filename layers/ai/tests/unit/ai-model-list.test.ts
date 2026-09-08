// Pure-function coverage for the OpenRouter model-list parser. Imports the util
// directly (its `#core` import is type-only, so it's erased — no Nuxt build
// needed; the runtime-config read only runs inside the network fetch).
import { describe, it, expect } from 'vitest'
import { parseOpenRouterModels } from '../../server/utils/ai-model-list'

function model(overrides: Record<string, unknown>) {
  return {
    id: 'vendor/model',
    name: 'Vendor Model',
    context_length: 128000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
    supported_parameters: ['temperature', 'tools', 'tool_choice'],
    ...overrides
  }
}

describe('parseOpenRouterModels', () => {
  it('keeps only tool-capable models', () => {
    const out = parseOpenRouterModels({
      data: [
        model({ id: 'a/with-tools' }),
        model({ id: 'b/no-tools', supported_parameters: ['temperature'] }),
        model({ id: 'c/no-params', supported_parameters: undefined })
      ]
    })
    expect(out.map(m => m.id)).toEqual(['a/with-tools'])
  })

  it('converts per-token prices to USD per million tokens', () => {
    const [m] = parseOpenRouterModels({ data: [model({})] })
    expect(m!.promptPrice).toBe(3)
    expect(m!.completionPrice).toBe(15)
  })

  it('reports null for missing or malformed prices and context', () => {
    const [m] = parseOpenRouterModels({
      data: [model({ pricing: { prompt: 'n/a' }, context_length: 0 })]
    })
    expect(m!.promptPrice).toBeNull()
    expect(m!.completionPrice).toBeNull()
    expect(m!.contextLength).toBeNull()
  })

  it('derives temperature support from supported_parameters', () => {
    const out = parseOpenRouterModels({
      data: [
        model({ id: 'a/temp', supported_parameters: ['temperature', 'tools'] }),
        model({ id: 'b/no-temp', supported_parameters: ['tools'] })
      ]
    })
    expect(out.find(m => m.id === 'a/temp')!.supportsTemperature).toBe(true)
    expect(out.find(m => m.id === 'b/no-temp')!.supportsTemperature).toBe(false)
  })

  it('derives caching support from cache-read pricing', () => {
    const out = parseOpenRouterModels({
      data: [
        model({ id: 'a/cached', pricing: { prompt: '0.000003', completion: '0.000015', input_cache_read: '0.0000003' } }),
        model({ id: 'b/plain' })
      ]
    })
    expect(out.find(m => m.id === 'a/cached')!.supportsCaching).toBe(true)
    expect(out.find(m => m.id === 'b/plain')!.supportsCaching).toBe(false)
  })

  it('falls back to the id as the name, dedupes ids, and sorts by name', () => {
    const out = parseOpenRouterModels({
      data: [
        model({ id: 'z/zed', name: 'Zed' }),
        model({ id: 'a/anon', name: '' }),
        model({ id: 'z/zed', name: 'Zed again' })
      ]
    })
    expect(out.map(m => m.id)).toEqual(['a/anon', 'z/zed'])
    expect(out[0]!.name).toBe('a/anon')
  })

  it('returns an empty list for a payload with no data array', () => {
    expect(parseOpenRouterModels(null)).toEqual([])
    expect(parseOpenRouterModels({})).toEqual([])
    expect(parseOpenRouterModels({ data: 'nope' })).toEqual([])
  })
})
