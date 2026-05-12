import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createOrgWithAdmin,
  createTenancyUser,
  addTestMembership,
  withOrgHeader,
  getAuthHeaders
} from '../helpers'

describe('PATCH /api/o/[orgSlug] (org-side rename)', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('admin can rename their own org', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const res = await $fetch(`/api/o/${org.slug}/`, {
      method: 'PATCH',
      body: { name: 'New Name' },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.name).toBe('New Name')
  })

  it('admin can change the slug', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const newSlug = `test-tenancy-${randomUUID().slice(0, 8)}`
    const res = await $fetch(`/api/o/${org.slug}/`, {
      method: 'PATCH',
      body: { slug: newSlug },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.slug).toBe(newSlug)
  })

  it('returns 400 when name is too short', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const err = await $fetch(`/api/o/${org.slug}/`, {
      method: 'PATCH',
      body: { name: 'X' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 400 for invalid slug', async () => {
    const { org, auth } = await createOrgWithAdmin(sql)
    const err = await $fetch(`/api/o/${org.slug}/`, {
      method: 'PATCH',
      body: { slug: 'NOT VALID!' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('non-admin member gets 403 (lacks org.settings.write)', async () => {
    const { org } = await createOrgWithAdmin(sql)
    const memberUser = await createTenancyUser(sql)
    await addTestMembership(sql, { user_id: memberUser.id, org_id: org.id, roles: ['member'] })

    const err = await $fetch(`/api/o/${org.slug}/`, {
      method: 'PATCH',
      body: { name: 'Hijack' },
      ...withOrgHeader(getAuthHeaders(memberUser), org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('returns 409 on slug conflict with another org', async () => {
    const a = await createOrgWithAdmin(sql)
    const b = await createOrgWithAdmin(sql)

    const err = await $fetch(`/api/o/${b.org.slug}/`, {
      method: 'PATCH',
      body: { slug: a.org.slug },
      ...withOrgHeader(b.auth, b.org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(409)
  })
})
