// Verifies the context layer registers its app tile, nav item, and
// permission grants — observed through the auth-gated per-org /_apps and
// /_nav endpoints (tenancy layer's API). Members get the tile because
// `context.access` is granted by default (CONTEXT_DEFAULT_GRANTS.member).
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupContextTestData,
  createContextOrgWith,
  addContextMember
} from '../helpers'

describe('context layer registration', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupContextTestData(sql)
  })

  it('appears in /api/o/:slug/_apps for a member with default grants', async () => {
    const { org } = await createContextOrgWith(sql, ['admin'])
    const m = await addContextMember(sql, org.id, ['member'])
    const res = await $fetch<{ apps: Array<{ id: string }> }>(
      `/api/o/${org.slug}/_apps`,
      { ...m.auth }
    )
    expect(res.apps.some(a => a.id === 'context')).toBe(true)
  })

  it('exposes the Portfolios nav item to a member with context.read', async () => {
    const { org, auth } = await createContextOrgWith(sql, ['admin'])
    const res = await $fetch<{ items: Array<{ path: string }> }>(
      `/api/o/${org.slug}/_nav?app=context`,
      { ...auth }
    )
    expect(res.items.some(n => n.path === '/context')).toBe(true)
  })
})
