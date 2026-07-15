// Conversation internal notes: add / keyset list / edit (edited marker) /
// delete, the empty-body guard, that notes + activity share a feed, and
// mention-recipient validation (client ids are untrusted).
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupInboxTestData,
  createInboxOrgWith,
  createInboxUser,
  addTestMembership,
  postInbound
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

async function makeConversation(domain: string): Promise<string> {
  const sender = `test-inbox-${randomUUID().slice(0, 8)}@sender.example`
  const res = await postInbound({ recipient: `hello@${domain}`, from: `N <${sender}>` })
  return res.body.conversation_id as string
}

describe('conversation notes', () => {
  it('adds, lists, edits (marks edited), and deletes a note', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const convId = await makeConversation(domain)

    const note = await $fetch<{ id: string, body: string, editedAt: string | null }>(
      `/api/inbox/conversations/${convId}/comments`,
      { method: 'POST', body: { body: 'Follow up next week' }, ...opts }
    )
    expect(note.body).toBe('Follow up next week')
    expect(note.editedAt).toBeNull()

    const list = await $fetch<{ items: Array<{ id: string }>, nextCursor: string | null }>(
      `/api/inbox/conversations/${convId}/comments`, opts
    )
    expect(list.items.map(i => i.id)).toContain(note.id)
    expect(list.nextCursor).toBeNull()

    const edited = await $fetch<{ body: string, editedAt: string | null }>(
      `/api/inbox/conversations/${convId}/comments/${note.id}`,
      { method: 'PATCH', body: { body: 'Follow up tomorrow' }, ...opts }
    )
    expect(edited.body).toBe('Follow up tomorrow')
    expect(edited.editedAt).not.toBeNull()

    await $fetch(`/api/inbox/conversations/${convId}/comments/${note.id}`, { method: 'DELETE', ...opts })
    const after = await $fetch<{ items: Array<{ id: string }> }>(`/api/inbox/conversations/${convId}/comments`, opts)
    expect(after.items.map(i => i.id)).not.toContain(note.id)
  })

  it('rejects an empty note', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const convId = await makeConversation(domain)
    await expect(
      $fetch(`/api/inbox/conversations/${convId}/comments`, { method: 'POST', body: { body: '   ' }, ...opts })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('has an activity feed to merge notes into', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const convId = await makeConversation(domain)
    const activity = await $fetch<{ items: Array<{ eventType: string }> }>(`/api/inbox/conversations/${convId}/activity`, opts)
    expect(activity.items.length).toBeGreaterThan(0)
  })

  it('notifies only mentioned teammates with inbox access — cross-org and nonexistent ids drop silently', async () => {
    const { org, opts, domain } = await createInboxOrgWith(sql)
    const convId = await makeConversation(domain)

    // A teammate in the same org (admin → holds inbox.access).
    const teammate = await createInboxUser(sql)
    await addTestMembership(sql, { user_id: teammate.id, org_id: org.id, roles: ['admin'] })

    // A real user who belongs to a different org, and an id that exists nowhere.
    const outsider = await createInboxOrgWith(sql)
    const ghost = randomUUID()

    const note = await $fetch<{ id: string }>(`/api/inbox/conversations/${convId}/comments`, {
      method: 'POST',
      body: { body: 'ping the team', mentions: [teammate.id, outsider.user.id, ghost] },
      ...opts
    })
    // The note saves despite the bad ids (a nonexistent uuid used to FK-fail
    // the whole transaction and lose the note).
    expect(note.id).toBeTruthy()

    const mentionRows = await sql`
      SELECT user_id FROM notifications
      WHERE title LIKE '%mentioned you in a note%' AND link = ${`/inbox/${convId}`}
    `
    expect(mentionRows.map(r => r.user_id as string)).toEqual([teammate.id])
  })
})
