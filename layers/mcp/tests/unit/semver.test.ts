import { describe, it, expect } from 'vitest'
import { compareVersions } from '../../server/utils/mcp-semver'

describe('compareVersions', () => {
  it('compares equal core versions as equal', () => {
    expect(compareVersions('1.20.0', '1.20.0')).toBe(0)
  })

  it('returns -1 when a is older', () => {
    expect(compareVersions('1.19.0', '1.20.0')).toBe(-1)
    expect(compareVersions('1.20.0', '2.0.0')).toBe(-1)
    expect(compareVersions('0.99.99', '1.0.0')).toBe(-1)
  })

  it('returns 1 when a is newer', () => {
    expect(compareVersions('1.20.1', '1.20.0')).toBe(1)
    expect(compareVersions('2.0.0', '1.99.0')).toBe(1)
  })

  it('treats a pre-release as less than its release', () => {
    expect(compareVersions('1.20.0-alpha.1', '1.20.0')).toBe(-1)
    expect(compareVersions('1.20.0-rc.5', '1.20.0')).toBe(-1)
    expect(compareVersions('1.20.0', '1.20.0-rc.5')).toBe(1)
  })

  it('compares two pre-releases by their core version, ignoring tag content', () => {
    expect(compareVersions('1.20.0-alpha.1', '1.20.0-rc.5')).toBe(0)
    expect(compareVersions('1.19.0-rc.99', '1.20.0-alpha.1')).toBe(-1)
  })

  it('treats SDK 1.20.0-alpha.1 as below the 1.20.0 floor (regression test)', () => {
    // The whole reason this function exists. Ensures pre-releases of the
    // floor version don't satisfy the floor check.
    expect(compareVersions('1.20.0-alpha.1', '1.20.0')).toBeLessThan(0)
  })

  it('handles longer version strings (4+ segments) by zero-extending', () => {
    expect(compareVersions('1.20', '1.20.0')).toBe(0)
    expect(compareVersions('1.20.0.1', '1.20.0')).toBe(1)
  })
})
