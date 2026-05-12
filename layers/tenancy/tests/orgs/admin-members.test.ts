import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupTenancyTestData,
  createOperatorAdmin,
  createTenancyUser,
  createTestOrg,
  addTestMembership,
  createOrgWithAdmin
} from '../helpers'

describe('host-admin /api/admin/orgs/[orgId]/members/*', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupTenancyTestData(sql)
  })
  it('GET lists members with email + display_name + roles', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    const member = await createTenancyUser(sql, { display_name: 'Bob' })
    await addTestMembership(sql, { user_id: member.id, org_id: org.id, roles: ['member'] })

    const res = await $fetch(`/api/admin/orgs/${org.id}/members`, auth)
    expect(Array.isArray(res.members)).toBe(true)
    const found = res.members.find((m: { user_id: string }) => m.user_id === member.id)
    expect(found).toBeDefined()
    expect(found.email).toBe(member.email)
    expect(found.display_name).toBe('Bob')
    expect(found.roles).toEqual(['member'])
  })

  it('POST attaches an existing user with given roles', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    const target = await createTenancyUser(sql)

    const res = await $fetch(`/api/admin/orgs/${org.id}/members`, {
      method: 'POST',
      body: { userId: target.id, roles: ['member'] },
      ...auth
    })
    expect(res.user_id).toBe(target.id)
    expect(res.roles).toEqual(['member'])

    const rows = await sql<{ roles: string[] }[]>`SELECT roles FROM memberships WHERE user_id = ${target.id} AND org_id = ${org.id}`
    expect(rows[0]!.roles).toEqual(['member'])
  })

  it('POST returns 404 when target user does not exist', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)

    const err = await $fetch(`/api/admin/orgs/${org.id}/members`, {
      method: 'POST',
      body: { userId: randomUUID(), roles: ['member'] },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('POST returns 409 when user is already a member', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    const target = await createTenancyUser(sql)
    await addTestMembership(sql, { user_id: target.id, org_id: org.id, roles: ['member'] })

    const err = await $fetch(`/api/admin/orgs/${org.id}/members`, {
      method: 'POST',
      body: { userId: target.id, roles: ['admin'] },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(409)
  })

  it('POST returns 400 for an unknown role name', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    const target = await createTenancyUser(sql)

    const err = await $fetch(`/api/admin/orgs/${org.id}/members`, {
      method: 'POST',
      body: { userId: target.id, roles: ['not_a_real_role'] },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('PATCH /roles can demote an admin when another admin exists', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const { org, user } = await createOrgWithAdmin(sql)
    const second = await createTenancyUser(sql)
    await addTestMembership(sql, { user_id: second.id, org_id: org.id, roles: ['admin'] })

    const res = await $fetch(`/api/admin/orgs/${org.id}/members/${user.id}/roles`, {
      method: 'PATCH',
      body: { roles: ['member'] },
      ...auth
    })
    expect(res.roles).toEqual(['member'])
  })

  it('PATCH /roles returns 409 when demoting the last admin', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const { org, user } = await createOrgWithAdmin(sql)

    const err = await $fetch(`/api/admin/orgs/${org.id}/members/${user.id}/roles`, {
      method: 'PATCH',
      body: { roles: ['member'] },
      ...auth
    }).catch(e => e)
    expect(err.statusCode).toBe(409)
    expect(String(err.statusMessage)).toMatch(/last admin/i)
  })

  it('DELETE removes a member', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    const member = await createTenancyUser(sql)
    await addTestMembership(sql, { user_id: member.id, org_id: org.id, roles: ['member'] })

    await $fetch(`/api/admin/orgs/${org.id}/members/${member.id}`, { method: 'DELETE', ...auth })

    const rows = await sql<{ c: number }[]>`SELECT count(*)::int as c FROM memberships WHERE user_id = ${member.id} AND org_id = ${org.id}`
    expect(rows[0]!.c).toBe(0)
  })

  it('DELETE returns 409 when removing the last admin', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const { org, user } = await createOrgWithAdmin(sql)

    const err = await $fetch(`/api/admin/orgs/${org.id}/members/${user.id}`, { method: 'DELETE', ...auth }).catch(e => e)
    expect(err.statusCode).toBe(409)
    expect(String(err.statusMessage)).toMatch(/last admin/i)
  })

  it('DELETE returns 404 when membership does not exist', async () => {
    const { auth } = await createOperatorAdmin(sql)
    const org = await createTestOrg(sql)
    const ghost = await createTenancyUser(sql)

    const err = await $fetch(`/api/admin/orgs/${org.id}/members/${ghost.id}`, { method: 'DELETE', ...auth }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
