// Pure-function coverage for the model catalog. Imports the util directly (its
// only `#core` import is type-only, so it's erased — no Nuxt build needed).
import { describe, it, expect } from 'vitest'
import {
  AI_MODEL_CATALOG,
  AI_DEFAULT_MODEL,
  getCatalogEntry,
  supportsTemperature,
  supportsCaching
} from '../../server/utils/ai-models'

describe('ai model catalog', () => {
  it('the default model is a catalog entry', () => {
    expect(getCatalogEntry(AI_DEFAULT_MODEL)).toBeDefined()
  })

  it('the default model is enabled by default', () => {
    const defaults = AI_MODEL_CATALOG.filter(m => m.defaultEnabled).map(m => m.id)
    expect(defaults).toContain(AI_DEFAULT_MODEL)
  })

  it('every catalog id is unique', () => {
    const ids = AI_MODEL_CATALOG.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('reports capability flags from the catalog, defaulting off for unknown ids', () => {
    expect(supportsCaching('anthropic/claude-sonnet-4.5')).toBe(true)
    expect(supportsTemperature('anthropic/claude-sonnet-4.5')).toBe(true)
    // Unknown/custom ids default to off — safer than assuming a model accepts
    // sampling params it might reject with a hard error.
    expect(supportsTemperature('some/unknown-model')).toBe(false)
    expect(supportsCaching('some/unknown-model')).toBe(false)
  })
})
