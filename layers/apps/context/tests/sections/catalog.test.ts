// Catalog endpoint: built-in sections appear in order, customs append past
// the built-in ceiling. Exercises GET /api/context/portfolios/:slug/sections.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextOrgWith,
  createTestPortfolio,
  seedTestCustomSection,
  withOrgHeader
} from '../helpers'
import { CONTEXT_SECTIONS } from '../../server/utils/section-catalog'

describe('GET /api/context/portfolios/:slug/sections (catalog)', () => {
  const sql = getHostAdminDb()
  afterEach(async () => { await cleanupContextTestData(sql) })

  it('returns the 9 built-ins for an empty portfolio', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Catalog', created_by: user.id })

    const res = await $fetch<{ sections: Array<{ key: string, is_custom: boolean, order: number }> }>(
      `/api/context/portfolios/${p.slug}/sections`,
      { ...withOrgHeader(auth, org.slug) }
    )
    expect(res.sections.length).toBe(CONTEXT_SECTIONS.length)
    expect(res.sections[0]?.key).toBe('identity')
    expect(res.sections.every(s => !s.is_custom)).toBe(true)
  })

  it('appends customs after built-ins, ordered by their `order`', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Customs', created_by: user.id })
    await seedTestCustomSection(sql, { portfolio_id: p.id, key: 'roadmap', title: 'Roadmap', order: 0, created_by: user.id })
    await seedTestCustomSection(sql, { portfolio_id: p.id, key: 'culture', title: 'Culture', order: 1, created_by: user.id })

    const res = await $fetch<{ sections: Array<{ key: string, is_custom: boolean, order: number }> }>(
      `/api/context/portfolios/${p.slug}/sections`,
      { ...withOrgHeader(auth, org.slug) }
    )
    const customs = res.sections.filter(s => s.is_custom)
    expect(customs.length).toBe(2)
    const builtinMax = Math.max(...CONTEXT_SECTIONS.map(s => s.order))
    for (const c of customs) {
      expect(c.order).toBeGreaterThan(builtinMax)
    }
  })
})
