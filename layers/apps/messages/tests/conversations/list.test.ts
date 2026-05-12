// GET /api/messages/conversations
// Lists channels + DMs visible to the caller, with unread counts.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupMessagesTestData,
  createMessagesOrgWith,
  addMessagesMember,
  createTestChannel,
  createTestDm,
  createTestItem,
  withOrgHeader
} from '../helpers'

interface ListResponse {
  channels: Array<{ id: string, name: string | null, description: string | null, subscribed: boolean, unread_count: number }>
  dms: Array<{ id: string, unread_count: number, members: Array<{ id: string, display_name: string, avatar: string }> }>
}

describe('GET /api/messages/conversations', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('returns an empty list for a fresh org', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const res = await $fetch<ListResponse>('/api/messages/conversations', withOrgHeader(auth, org.slug))
    expect(res.channels).toEqual([])
    expect(res.dms).toEqual([])
  })

  it('lists a created channel with unread_count=0 when no other user has posted', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, {
      org_id: org.id,
      created_by: user.id,
      name: 'test-messages-list-1'
    })

    const res = await $fetch<ListResponse>('/api/messages/conversations', withOrgHeader(auth, org.slug))
    expect(res.channels.length).toBe(1)
    expect(res.channels[0]!.id).toBe(ch.id)
    expect(res.channels[0]!.name).toBe('test-messages-list-1')
    expect(res.channels[0]!.unread_count).toBe(0)
    expect(res.channels[0]!.subscribed).toBe(false)
  })

  it('shows non-zero unread_count when another user has posted since my last_read', async () => {
    const { org, user: admin, auth } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: admin.id })

    // Another user posts two items; caller (admin) hasn't read them.
    await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: other.user.id })
    await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: other.user.id })

    const res = await $fetch<ListResponse>('/api/messages/conversations', withOrgHeader(auth, org.slug))
    const row = res.channels.find(c => c.id === ch.id)!
    expect(row.unread_count).toBe(2)
  })

  it('lists a DM with both members', async () => {
    const { org, user: a, auth } = await createMessagesOrgWith(sql, ['admin'])
    const b = await addMessagesMember(sql, org.id, ['member'])
    const dm = await createTestDm(sql, { org_id: org.id, created_by: a.id, other_user_id: b.user.id })

    const res = await $fetch<ListResponse>('/api/messages/conversations', withOrgHeader(auth, org.slug))
    expect(res.dms.length).toBe(1)
    expect(res.dms[0]!.id).toBe(dm.id)
    expect(res.dms[0]!.members.map(m => m.id).sort()).toEqual([a.id, b.user.id].sort())
  })

  it('does not list DMs the caller is not a member of', async () => {
    const { org, user: admin, auth } = await createMessagesOrgWith(sql, ['admin'])
    const x = await addMessagesMember(sql, org.id, ['member'])
    const y = await addMessagesMember(sql, org.id, ['member'])
    // DM between x and y — admin should not see it
    await createTestDm(sql, { org_id: org.id, created_by: x.user.id, other_user_id: y.user.id })
    // unused
    void admin

    const res = await $fetch<ListResponse>('/api/messages/conversations', withOrgHeader(auth, org.slug))
    expect(res.dms.length).toBe(0)
  })

  it('hides archived channels', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    await sql`UPDATE messages_conversations SET archived_at = now() WHERE id = ${ch.id}`

    const res = await $fetch<ListResponse>('/api/messages/conversations', withOrgHeader(auth, org.slug))
    expect(res.channels.find(c => c.id === ch.id)).toBeUndefined()
  })

  it('returns 404 for unknown org', async () => {
    const { auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/conversations', {
      ...withOrgHeader(auth, 'test-messages-nonexistent')
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
