// /api/o/[orgSlug]/permissions and /audit
import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createOrgWithAdmin,
  createTenancyUser,
  addTestMembership,
  withOrgHeader,
  getAuthHeaders
} from '../helpers'

describe('GET /api/o/[orgSlug]/permissions', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('admin sees the registered permission catalog', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const res = await $fetch(`/api/o/${org.slug}/permissions`, withOrgHeader(auth, org.slug))
    expect(Array.isArray(res.permissions)).toBe(true)
    expect(res.permissions.length).toBeGreaterThan(0)
    // Tenancy layer registers org.* permissions
    const orgPerms = res.permissions.filter((p: { perm: string }) => p.perm.startsWith('org.'))
    expect(orgPerms.length).toBeGreaterThan(0)
    for (const p of res.permissions) {
      expect(typeof p.perm).toBe('string')
      expect(typeof p.title).toBe('string')
    }
  })

  it('non-admin without org.roles.read gets 403', async () => {
    const { org } = await createOrgWithAdmin(sql)
    const member = await createTenancyUser(sql)
    await addTestMembership(sql, { user_id: member.id, org_id: org.id, roles: ['member'] })

    const err = await $fetch(`/api/o/${org.slug}/permissions`, withOrgHeader(getAuthHeaders(member), org.slug)).catch(e => e)
    expect(err.statusCode).toBe(403)
  })
})

describe('GET /api/o/[orgSlug]/audit', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('admin can fetch the audit log (empty if no events)', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const res = await $fetch(`/api/o/${org.slug}/audit`, withOrgHeader(auth, org.slug))
    expect(Array.isArray(res.logs)).toBe(true)
    // No org-side events have been triggered for this org yet
    expect(res.nextCursor).toBeNull()
  })

  it('audit reflects an event after a rename', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)

    await $fetch(`/api/o/${org.slug}/`, {
      method: 'PATCH',
      body: { name: 'Audited Name' },
      ...withOrgHeader(auth, org.slug)
    })

    const res = await $fetch(`/api/o/${org.slug}/audit`, withOrgHeader(auth, org.slug))
    const renames = res.logs.filter((l: { event_type: string }) => l.event_type === 'org_updated')
    expect(renames.length).toBeGreaterThan(0)
  })

  it('non-admin member gets 403', async () => {
    const { org } = await createOrgWithAdmin(sql)
    const member = await createTenancyUser(sql)
    await addTestMembership(sql, { user_id: member.id, org_id: org.id, roles: ['member'] })

    const err = await $fetch(`/api/o/${org.slug}/audit`, withOrgHeader(getAuthHeaders(member), org.slug)).catch(e => e)
    expect(err.statusCode).toBe(403)
  })
})
