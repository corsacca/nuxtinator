// Custom section definitions via HTTP: create, collision (409), isolation
// across portfolios. The handler slugifies the title; key collisions inside
// the same portfolio return 409; the same key across two portfolios is
// allowed.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextOrgWith,
  createTestPortfolio,
  withOrgHeader
} from '../helpers'

describe('POST /api/context/portfolios/:slug/custom-sections', () => {
  const sql = getHostAdminDb()
  afterEach(async () => { await cleanupContextTestData(sql) })

  it('creates a custom section with a slugified key', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Customs', created_by: user.id })

    const res = await $fetch<{ id: string, key: string, title: string }>(
      `/api/context/portfolios/${p.slug}/custom-sections`,
      { method: 'POST', body: { title: 'Roadmap' }, ...withOrgHeader(auth, org.slug) }
    )
    expect(res.key).toBe('roadmap')
    expect(res.title).toBe('Roadmap')
  })

  it('rejects collision with a built-in key with 409', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Builtin Clash', created_by: user.id })

    const err = await $fetch(`/api/context/portfolios/${p.slug}/custom-sections`, {
      method: 'POST',
      body: { title: 'Identity' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(409)
  })

  it('rejects duplicate custom key within a portfolio with 409', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Dup', created_by: user.id })

    await $fetch(`/api/context/portfolios/${p.slug}/custom-sections`, {
      method: 'POST',
      body: { title: 'Culture' },
      ...withOrgHeader(auth, org.slug)
    })
    const err = await $fetch(`/api/context/portfolios/${p.slug}/custom-sections`, {
      method: 'POST',
      body: { title: 'Culture' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(409)
  })

  it('two portfolios in the same org can share a custom key', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const pA = await createTestPortfolio(sql, { org_id: org.id, name: 'A', created_by: user.id })
    const pB = await createTestPortfolio(sql, { org_id: org.id, name: 'B', created_by: user.id })

    await $fetch(`/api/context/portfolios/${pA.slug}/custom-sections`, {
      method: 'POST',
      body: { title: 'Roadmap' },
      ...withOrgHeader(auth, org.slug)
    })
    const res = await $fetch<{ key: string }>(
      `/api/context/portfolios/${pB.slug}/custom-sections`,
      { method: 'POST', body: { title: 'Roadmap' }, ...withOrgHeader(auth, org.slug) }
    )
    expect(res.key).toBe('roadmap')
  })

  it('rejects title with no alphanumerics with 400', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Bad title', created_by: user.id })

    const err = await $fetch(`/api/context/portfolios/${p.slug}/custom-sections`, {
      method: 'POST',
      body: { title: '   ' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})
