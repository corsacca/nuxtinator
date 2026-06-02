// Single-section markdown export via HTTP.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextOrgWith,
  createTestPortfolio,
  withOrgHeader
} from '../helpers'

describe('GET /api/context/portfolios/:slug/sections/:key/export', () => {
  const sql = getHostAdminDb()
  afterEach(async () => { await cleanupContextTestData(sql) })

  it('returns text/markdown with H1 title and the section content', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Export', created_by: user.id })
    await $fetch(`/api/context/portfolios/${p.slug}/sections/identity`, {
      method: 'PUT', body: { content: 'We are Acme.' }, ...withOrgHeader(auth, org.slug)
    })

    const md = await $fetch<string>(
      `/api/context/portfolios/${p.slug}/sections/identity/export`,
      { ...withOrgHeader(auth, org.slug) }
    )
    expect(md).toBe('# Identity\n\nWe are Acme.')
  })

  it('emits the title even for an empty section', async () => {
    const { org, auth, user } = await createContextOrgWith(sql, ['admin'])
    const p = await createTestPortfolio(sql, { org_id: org.id, name: 'Empty Export', created_by: user.id })

    const md = await $fetch<string>(
      `/api/context/portfolios/${p.slug}/sections/identity/export`,
      { ...withOrgHeader(auth, org.slug) }
    )
    expect(md.startsWith('# Identity\n\n')).toBe(true)
  })
})
