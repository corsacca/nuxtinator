// Cross-org isolation + per-user scoping.
//
// Two layers of separation matter here:
//   1. Org boundary (RLS + tenancy middleware). A user who is a member of
//      orgA cannot see orgB's contacts even if they smuggle in an orgB slug.
//      The tenancy Nitro middleware rejects them with 404 before the handler
//      runs.
//   2. User boundary (handler-level `where user_id = ctx.userId`). Two
//      members of the same org never see each other's contacts.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupListOf100TestData,
  createListOf100OrgWith,
  addListOf100Member,
  createTestContact,
  withOrgHeader
} from '../helpers'

describe('list-of-100 RLS + ownership isolation', () => {
  const sql = getHostAdminDb()
  afterEach(async () => { await cleanupListOf100TestData(sql) })

  it('non-member of orgA gets 404 when listing orgA\'s contacts', async () => {
    const a = await createListOf100OrgWith(sql, ['admin'])
    const b = await createListOf100OrgWith(sql, ['admin'])
    await createTestContact(sql, { user_id: a.user.id, org_id: a.org.id, name: 'PrivateA' })

    // b's auth aimed at a's slug. Tenancy middleware 404s before the handler.
    const err = await $fetch('/api/list-of-100/contacts', {
      ...withOrgHeader(b.auth, a.org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('two members of the same org each see only their own contacts (per-user scope)', async () => {
    const a = await createListOf100OrgWith(sql, ['admin'])
    const m = await addListOf100Member(sql, a.org.id, ['member'])

    await createTestContact(sql, { user_id: a.user.id, org_id: a.org.id, name: 'AdminA' })
    await createTestContact(sql, { user_id: a.user.id, org_id: a.org.id, name: 'AdminB' })
    await createTestContact(sql, { user_id: m.user.id, org_id: a.org.id, name: 'MemberOnly' })

    const adminRes = await $fetch<{ contacts: { name: string }[] }>(
      '/api/list-of-100/contacts',
      { ...withOrgHeader(a.auth, a.org.slug) }
    )
    expect(adminRes.contacts.map(c => c.name).sort()).toEqual(['AdminA', 'AdminB'])

    const memberRes = await $fetch<{ contacts: { name: string }[] }>(
      '/api/list-of-100/contacts',
      { ...withOrgHeader(m.auth, a.org.slug) }
    )
    expect(memberRes.contacts.map(c => c.name)).toEqual(['MemberOnly'])
  })

  it('contacts created in orgA do not leak into orgB even when caller belongs to both', async () => {
    const a = await createListOf100OrgWith(sql, ['admin'])
    const b = await createListOf100OrgWith(sql, ['admin'])
    // Add `a.user` as a member of b so they can switch context.
    await sql`
      INSERT INTO memberships (id, user_id, org_id, roles)
      VALUES (gen_random_uuid(), ${a.user.id}, ${b.org.id}, ${['admin']})
    `

    await createTestContact(sql, { user_id: a.user.id, org_id: a.org.id, name: 'OnlyInA' })
    await createTestContact(sql, { user_id: a.user.id, org_id: b.org.id, name: 'OnlyInB' })

    // Same user, different active org: RLS filters by org_id.
    const inA = await $fetch<{ contacts: { name: string }[] }>(
      '/api/list-of-100/contacts',
      { ...withOrgHeader(a.auth, a.org.slug) }
    )
    expect(inA.contacts.map(c => c.name)).toEqual(['OnlyInA'])

    const inB = await $fetch<{ contacts: { name: string }[] }>(
      '/api/list-of-100/contacts',
      { ...withOrgHeader(a.auth, b.org.slug) }
    )
    expect(inB.contacts.map(c => c.name)).toEqual(['OnlyInB'])
  })

  it('progress count for a user is isolated per active org', async () => {
    const a = await createListOf100OrgWith(sql, ['admin'])
    const b = await createListOf100OrgWith(sql, ['admin'])
    await sql`
      INSERT INTO memberships (id, user_id, org_id, roles)
      VALUES (gen_random_uuid(), ${a.user.id}, ${b.org.id}, ${['admin']})
    `

    await createTestContact(sql, { user_id: a.user.id, org_id: a.org.id })
    await createTestContact(sql, { user_id: a.user.id, org_id: a.org.id })
    await createTestContact(sql, { user_id: a.user.id, org_id: b.org.id })

    const inA = await $fetch<{ total: number }>('/api/list-of-100/progress', {
      ...withOrgHeader(a.auth, a.org.slug)
    })
    expect(inA.total).toBe(2)

    const inB = await $fetch<{ total: number }>('/api/list-of-100/progress', {
      ...withOrgHeader(a.auth, b.org.slug)
    })
    expect(inB.total).toBe(1)
  })
})
