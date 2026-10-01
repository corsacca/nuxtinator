// Portfolio template registration: the built-in default template, and the
// checks that reject a duplicate id or a malformed section list at boot.
import { describe, it, expect } from 'vitest'
import {
  registerPortfolioTemplate,
  getRegisteredPortfolioTemplate,
  getRegisteredPortfolioTemplates
} from '../../server/utils/portfolio-template-registry'
import { CONTEXT_SECTIONS } from '../../server/utils/section-catalog'

const section = (key: string, order = 1) => ({ key, title: key, description: '', order, staleness_days: 60 })

describe('portfolio template registry', () => {
  it('serves the built-in catalog as the default template', () => {
    expect(getRegisteredPortfolioTemplate(null)?.sections).toEqual(CONTEXT_SECTIONS)
    expect(getRegisteredPortfolioTemplate('default')?.id).toBe('default')
    expect(getRegisteredPortfolioTemplate('unit-missing')).toBeNull()
  })

  it('registers a template and returns it by id', () => {
    registerPortfolioTemplate({ id: 'unit-ok', label: 'Unit', sections: [section('a', 1), section('b', 2)] })
    expect(getRegisteredPortfolioTemplate('unit-ok')?.sections.map(s => s.key)).toEqual(['a', 'b'])
    expect(getRegisteredPortfolioTemplates().map(t => t.id)).toContain('unit-ok')
  })

  it('rejects a duplicate template id, including the default', () => {
    registerPortfolioTemplate({ id: 'unit-dup', label: 'Unit', sections: [] })
    expect(() => registerPortfolioTemplate({ id: 'unit-dup', label: 'Unit', sections: [] })).toThrow(/already registered/)
    expect(() => registerPortfolioTemplate({ id: 'default', label: 'Unit', sections: [] })).toThrow(/already registered/)
  })

  it('rejects duplicate or malformed section keys', () => {
    expect(() => registerPortfolioTemplate({ id: 'unit-keys', label: 'Unit', sections: [section('a'), section('a', 2)] }))
      .toThrow(/more than once/)
    expect(() => registerPortfolioTemplate({ id: 'unit-bad-key', label: 'Unit', sections: [section('Not A Key')] }))
      .toThrow(/invalid section key/)
    expect(getRegisteredPortfolioTemplate('unit-keys')).toBeNull()
  })

  it('rejects a malformed template id or a missing label', () => {
    expect(() => registerPortfolioTemplate({ id: 'Bad Id', label: 'Unit', sections: [] })).toThrow(/template id/)
    expect(() => registerPortfolioTemplate({ id: 'unit-no-label', label: '', sections: [] })).toThrow(/label/)
  })
})
