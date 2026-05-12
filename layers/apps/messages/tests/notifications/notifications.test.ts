// GET /api/messages/notifications + POST /api/messages/notifications/read
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

async function seedNotification(
  sql: ReturnType<typeof getHostAdminDb>,
  opts: {
    user_id: string, actor_id: string, item_id: string, conversation_id: string, org_id: string, kind?: string
  }
): Promise<string> {
  const id = randomUUID()
  const kind = opts.kind ?? 'mention'
  await sql`
    INSERT INTO messages_notifications
      (id, user_id, kind, item_id, conversation_id, actor_id, org_id)
    VALUES (${id}, ${opts.user_id}, ${kind}, ${opts.item_id}, ${opts.conversation_id}, ${opts.actor_id}, ${opts.org_id})
  `
  return id
}

describe('GET /api/messages/notifications', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('returns the caller\'s notifications newest-first with unread_count', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const actor = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: actor.user.id })
    await seedNotification(sql, { user_id: user.id, actor_id: actor.user.id, item_id: it.id, conversation_id: ch.id, org_id: org.id })

    const res = await $fetch<{ notifications: Array<{ id: string, kind: string, read_at: string | null }>, unread_count: number }>(
      '/api/messages/notifications',
      withOrgHeader(auth, org.slug)
    )
    expect(res.notifications.length).toBe(1)
    expect(res.notifications[0]!.kind).toBe('mention')
    expect(res.notifications[0]!.read_at).toBeNull()
    expect(res.unread_count).toBe(1)
  })

  it('honors unread_only=true', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const actor = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: actor.user.id })

    const readId = await seedNotification(sql, { user_id: user.id, actor_id: actor.user.id, item_id: it.id, conversation_id: ch.id, org_id: org.id })
    await sql`UPDATE messages_notifications SET read_at = now() WHERE id = ${readId}`
    const unreadId = await seedNotification(sql, { user_id: user.id, actor_id: actor.user.id, item_id: it.id, conversation_id: ch.id, org_id: org.id })

    const res = await $fetch<{ notifications: Array<{ id: string }> }>(
      '/api/messages/notifications?unread_only=true',
      withOrgHeader(auth, org.slug)
    )
    const ids = res.notifications.map(n => n.id)
    expect(ids).toContain(unreadId)
    expect(ids).not.toContain(readId)
  })

  it('does not leak other users\' notifications', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    // notification belongs to `other`, not the caller
    const foreignId = await seedNotification(sql, { user_id: other.user.id, actor_id: user.id, item_id: it.id, conversation_id: ch.id, org_id: org.id })

    const res = await $fetch<{ notifications: Array<{ id: string }> }>(
      '/api/messages/notifications',
      withOrgHeader(auth, org.slug)
    )
    expect(res.notifications.map(n => n.id)).not.toContain(foreignId)
  })
})

describe('POST /api/messages/notifications/read', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('marks the supplied ids as read', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const actor = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: actor.user.id })

    const a = await seedNotification(sql, { user_id: user.id, actor_id: actor.user.id, item_id: it.id, conversation_id: ch.id, org_id: org.id })
    const b = await seedNotification(sql, { user_id: user.id, actor_id: actor.user.id, item_id: it.id, conversation_id: ch.id, org_id: org.id })

    await $fetch('/api/messages/notifications/read', {
      method: 'POST',
      body: { ids: [a] },
      ...withOrgHeader(auth, org.slug)
    })

    const rows = await sql<{ id: string, read_at: Date | null }[]>`
      SELECT id, read_at FROM messages_notifications WHERE id IN (${a}, ${b})
    `
    const map = new Map(rows.map(r => [r.id, r.read_at]))
    expect(map.get(a)).not.toBeNull()
    expect(map.get(b)).toBeNull()
  })

  it('all=true marks every unread notification read', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const actor = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: actor.user.id })
    await seedNotification(sql, { user_id: user.id, actor_id: actor.user.id, item_id: it.id, conversation_id: ch.id, org_id: org.id })
    await seedNotification(sql, { user_id: user.id, actor_id: actor.user.id, item_id: it.id, conversation_id: ch.id, org_id: org.id })

    await $fetch('/api/messages/notifications/read', {
      method: 'POST',
      body: { all: true },
      ...withOrgHeader(auth, org.slug)
    })

    const rows = await sql<{ read_at: Date | null }[]>`
      SELECT read_at FROM messages_notifications WHERE user_id = ${user.id}
    `
    for (const r of rows) expect(r.read_at).not.toBeNull()
  })

  it('returns 400 when neither ids nor all is provided', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/notifications/read', {
      method: 'POST',
      body: {},
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 400 when ids is an empty array (must not fall through to mark-all)', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/notifications/read', {
      method: 'POST',
      body: { ids: [] },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})
