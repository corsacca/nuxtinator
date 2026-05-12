// POST /api/messages/conversations/channels
// Verifies the channel-create flow: permission gating, row shape, leading-#
// normalization, validation. messages.channel.create is in the default
// member grants, so any org member can create; non-members get 404 from
// the tenancy middleware (org gate runs before perm gate).
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupMessagesTestData,
  createMessagesOrgWith,
  addMessagesMember,
  withOrgHeader
} from '../helpers'

describe('POST /api/messages/conversations/channels', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('admin creates a channel; row exists in DB with the supplied name', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const name = `test-messages-${Math.random().toString(36).slice(2, 10)}`

    const res = await $fetch('/api/messages/conversations/channels', {
      method: 'POST',
      body: { name, description: 'hello' },
      ...withOrgHeader(auth, org.slug)
    })

    expect(res.id).toBeDefined()
    expect(res.kind).toBe('channel')
    expect(res.name).toBe(name)
    expect(res.description).toBe('hello')

    const rows = await sql<{ id: string, name: string, description: string | null, kind: string, org_id: string }[]>`
      SELECT id, name, description, kind, org_id
      FROM messages_conversations WHERE id = ${res.id}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.kind).toBe('channel')
    expect(rows[0]!.name).toBe(name)
    expect(rows[0]!.org_id).toBe(org.id)
  })

  it('strips a leading # from the channel name', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const res = await $fetch('/api/messages/conversations/channels', {
      method: 'POST',
      body: { name: '#test-messages-hash' },
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.name).toBe('test-messages-hash')
  })

  it('member with default grants can create (messages.channel.create is in member defaults)', async () => {
    const { org } = await createMessagesOrgWith(sql, ['admin'])
    const m = await addMessagesMember(sql, org.id, ['member'])
    const res = await $fetch('/api/messages/conversations/channels', {
      method: 'POST',
      body: { name: 'test-messages-member-channel' },
      ...withOrgHeader(m.auth, org.slug)
    })
    expect(res.id).toBeDefined()
  })

  it('rejects empty name with 400', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/conversations/channels', {
      method: 'POST',
      body: { name: '   ' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 401 when no auth cookie is present', async () => {
    const { org } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/conversations/channels', {
      method: 'POST',
      body: { name: 'x' },
      headers: { 'x-active-org': org.slug }
    }).catch(e => e)
    expect(err.statusCode).toBe(401)
  })

  it('returns 404 when caller is not a member of the org (tenancy gate)', async () => {
    const a = await createMessagesOrgWith(sql, ['admin'])
    const b = await createMessagesOrgWith(sql, ['admin'])

    // a's auth points an X-Active-Org at b's slug
    const err = await $fetch('/api/messages/conversations/channels', {
      method: 'POST',
      body: { name: 'test-messages-foreign' },
      ...withOrgHeader(a.auth, b.org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
