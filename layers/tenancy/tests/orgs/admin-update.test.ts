import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createOperatorAdmin,
  createTestOrg
} from '../helpers'

describe('PATCH + suspend on /api/admin/orgs/[orgId]', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('PATCH renames an org', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)

    const res = await $fetch(`/api/admin/orgs/${org.id}`, {
      method: 'PATCH',
      body: { name: 'Renamed Org' },
      ...auth
    })
    expect(res.name).toBe('Renamed Org')

    const rows = await sql<{ name: string }[]>`SELECT name FROM orgs WHERE id = ${org.id}`
    expect(rows[0]!.name).toBe('Renamed Org')
  })

  it('PATCH changes the slug', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    const newSlug = `test-tenancy-${randomUUID().slice(0, 8)}`

    const res = await $fetch(`/api/admin/orgs/${org.id}`, {
      method: 'PATCH',
      body: { slug: newSlug },
      ...auth
    })
    expect(res.slug).toBe(newSlug)
  })

  it('PATCH returns 400 for an invalid slug', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)

    const err = await $fetch(`/api/admin/orgs/${org.id}`, {
      method: 'PATCH',
      body: { slug: 'INVALID SLUG!' },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH returns 409 on slug conflict', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const orgA = await createTestOrg(sql)
    const orgB = await createTestOrg(sql)

    const err = await $fetch(`/api/admin/orgs/${orgB.id}`, {
      method: 'PATCH',
      body: { slug: orgA.slug },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(409)
  })

  it('PATCH returns 404 for an unknown orgId', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const err = await $fetch(`/api/admin/orgs/${randomUUID()}`, {
      method: 'PATCH',
      body: { name: 'Anything' },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('POST /suspend sets suspended_at', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)

    const susp = await $fetch(`/api/admin/orgs/${org.id}/suspend`, {
      method: 'POST',
      body: { suspended: true },
      ...auth
    })
    expect(susp.suspended).toBe(true)
    const rows = await sql<{ suspended_at: Date | null }[]>`SELECT suspended_at FROM orgs WHERE id = ${org.id}`
    expect(rows[0]!.suspended_at).not.toBeNull()
  })

  it('POST /suspend can unsuspend a suspended org (middleware special-cases the toggle)', async () => {
    const { auth, user: adminUser } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    await sql`INSERT INTO memberships (id, user_id, org_id, roles) VALUES (${randomUUID()}, ${adminUser.id}, ${org.id}, ${'{admin}'})`

    await $fetch(`/api/admin/orgs/${org.id}/suspend`, { method: 'POST', body: { suspended: true }, ...auth })

    const res = await $fetch(`/api/admin/orgs/${org.id}/suspend`, {
      method: 'POST',
      body: { suspended: false },
      ...auth
    })
    expect(res.suspended).toBe(false)

    const rows = await sql<{ suspended_at: Date | null }[]>`SELECT suspended_at FROM orgs WHERE id = ${org.id}`
    expect(rows[0]!.suspended_at).toBeNull()
  })

  it('suspended org returns 423 for /api/o/:slug requests by members', async () => {
    const { auth, user: member } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    await sql`INSERT INTO memberships (id, user_id, org_id, roles) VALUES (${randomUUID()}, ${member.id}, ${org.id}, ${'{admin}'})`
    await $fetch(`/api/admin/orgs/${org.id}/suspend`, { method: 'POST', body: { suspended: true }, ...auth })

    const err = await $fetch(`/api/o/${org.slug}/`, {
      headers: { ...auth.headers, 'x-active-org': org.slug }
    }).catch(e => e)
    expect(err.statusCode).toBe(423)
  })
})
