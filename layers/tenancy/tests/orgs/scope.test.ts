// Cross-org isolation. The middleware (00.tenancy-context.ts) is the gate:
// non-members of an org get 404 from the same code path that handles
// "org doesn't exist" — same response, no leak about whether the org is real.
import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createOrgWithAdmin,
  withOrgHeader
} from '../helpers'

describe('Cross-org isolation via X-Active-Org header', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('member sees their own org via /api/o/:slug/', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)

    const res = await $fetch(`/api/o/${org.slug}/`, withOrgHeader(auth, org.slug))

    expect(res.id).toBe(org.id)
    expect(res.slug).toBe(org.slug)
    expect(res.member_count).toBe(1)
  })

  it('non-member of orgB gets 404 when querying orgB', async () => {
    const a = await createOrgWithAdmin(sql)
    const b = await createOrgWithAdmin(sql)

    // a's user is admin of orgA only — querying orgB should 404
    const err = await $fetch(`/api/o/${b.org.slug}/`, withOrgHeader(a.auth, b.org.slug)).catch(e => e)

    expect(err.statusCode).toBe(404)
  })

  it('non-existent org slug gets 404 (same response shape — no leak)', async () => {
    const { auth } = await createOrgWithAdmin(sql)

    const err = await $fetch('/api/o/test-tenancy-does-not-exist/', withOrgHeader(auth, 'test-tenancy-does-not-exist')).catch(e => e)

    expect(err.statusCode).toBe(404)
  })

  it('unauthenticated request gets 401 (auth gate runs before org gate)', async () => {
    const { org } = await createOrgWithAdmin(sql)

    const err = await $fetch(`/api/o/${org.slug}/`, {
      headers: { 'x-active-org': org.slug }
    }).catch(e => e)

    expect(err.statusCode).toBe(401)
  })
})
