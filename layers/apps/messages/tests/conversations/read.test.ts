// POST /api/messages/conversations/:id/read
// Upserts the caller's last_read_at to now, and marks unread notifications
// for this conversation as read.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupMessagesTestData,
  createMessagesOrgWith,
  addMessagesMember,
  createTestChannel,
  createTestItem,
  withOrgHeader
} from '../helpers'

describe('POST /api/messages/conversations/:id/read', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('upserts a messages_conversation_reads row with last_read_at = now', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })

    await $fetch(`/api/messages/conversations/${ch.id}/read`, { method: 'POST', ...withOrgHeader(auth, org.slug) })

    const rows = await sql<{ last_read_at: Date }[]>`
      SELECT last_read_at FROM messages_conversation_reads
      WHERE user_id = ${user.id} AND conversation_id = ${ch.id}
    `
    expect(rows.length).toBe(1)
    // Should be within the last few seconds.
    expect(Date.now() - new Date(rows[0]!.last_read_at).getTime()).toBeLessThan(5000)
  })

  it('clears unread notifications scoped to the conversation', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const item = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: other.user.id })

    // Seed an unread notification for the caller on this conversation.
    const notifId = randomUUID()
    await sql`
      INSERT INTO messages_notifications
        (id, user_id, kind, item_id, conversation_id, actor_id, org_id)
      VALUES (${notifId}, ${user.id}, 'mention', ${item.id}, ${ch.id}, ${other.user.id}, ${org.id})
    `

    await $fetch(`/api/messages/conversations/${ch.id}/read`, { method: 'POST', ...withOrgHeader(auth, org.slug) })

    const rows = await sql<{ read_at: Date | null }[]>`
      SELECT read_at FROM messages_notifications WHERE id = ${notifId}
    `
    expect(rows[0]!.read_at).not.toBeNull()
  })

  it('returns 404 for an unknown conversation id', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/conversations/00000000-0000-0000-0000-000000000000/read', {
      method: 'POST',
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
