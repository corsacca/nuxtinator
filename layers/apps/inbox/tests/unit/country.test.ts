// Country normalization for the public contact form: alpha-2/alpha-3 in any
// case → uppercase alpha-2; unknown/malformed → null, never an error.
import { describe, it, expect } from 'vitest'
import { inboxNormalizeCountry } from '../../server/utils/inbox-country'

describe('inboxNormalizeCountry', () => {
  it('normalizes alpha-3 to alpha-2', () => {
    expect(inboxNormalizeCountry('DEU')).toBe('DE')
    expect(inboxNormalizeCountry('usa')).toBe('US')
    expect(inboxNormalizeCountry(' gbr ')).toBe('GB')
  })

  it('passes valid alpha-2 through uppercased', () => {
    expect(inboxNormalizeCountry('de')).toBe('DE')
    expect(inboxNormalizeCountry('NL')).toBe('NL')
  })

  it('returns null for unknown or malformed values', () => {
    expect(inboxNormalizeCountry('XYZ')).toBeNull()
    expect(inboxNormalizeCountry('ZZ')).toBeNull()
    expect(inboxNormalizeCountry('GERMANY')).toBeNull()
    expect(inboxNormalizeCountry('D3')).toBeNull()
    expect(inboxNormalizeCountry('')).toBeNull()
    expect(inboxNormalizeCountry(null)).toBeNull()
    expect(inboxNormalizeCountry(undefined)).toBeNull()
  })
})
