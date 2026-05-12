// GET /api/messages/conversations/:id/items
// Paginated descending list. Includes per-item reactions summary, comment
// count, and caller's tags/star state.
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
  createTestComment,
  withOrgHeader
} from '../helpers'

interface ItemsResponse {
  items: Array<{
    id: string
    kind: string
    body_md: string | null
    starred: boolean
    my_tags: string[]
    comment_count: number
    reactions: Array<{ emoji: string, count: number, mine: boolean }>
  }>
  next_cursor: string | null
}

describe('GET /api/messages/conversations/:id/items', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('returns items in DESC order, paginated', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })

    // Create 3 items with sequential bodies so we can verify order.
    const itemIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const it = await createTestItem(sql, {
        org_id: org.id,
        conversation_id: ch.id,
        author_id: user.id,
        body_md: `item-${i}`
      })
      itemIds.push(it.id)
      // small sleep so created_at differs
      await new Promise(r => setTimeout(r, 10))
    }

    const res = await $fetch<ItemsResponse>(
      `/api/messages/conversations/${ch.id}/items?limit=2`,
      withOrgHeader(auth, org.slug)
    )
    expect(res.items.length).toBe(2)
    // Newest first
    expect(res.items[0]!.body_md).toBe('item-2')
    expect(res.items[1]!.body_md).toBe('item-1')
    expect(res.next_cursor).not.toBeNull()
  })

  it('comment_count reflects non-deleted comments', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id })
    await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id })

    const res = await $fetch<ItemsResponse>(
      `/api/messages/conversations/${ch.id}/items`,
      withOrgHeader(auth, org.slug)
    )
    const item = res.items.find(i => i.id === it.id)!
    expect(item.comment_count).toBe(2)
  })

  it('reactions summary includes mine=true when caller is in the reactor set', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })

    // Two users reacted with the same emoji.
    await sql`
      INSERT INTO messages_reactions (id, target_kind, target_id, user_id, emoji, org_id)
      VALUES (${randomUUID()}, 'item', ${it.id}, ${user.id},  '👍', ${org.id}),
             (${randomUUID()}, 'item', ${it.id}, ${other.user.id}, '👍', ${org.id})
    `

    const res = await $fetch<ItemsResponse>(
      `/api/messages/conversations/${ch.id}/items`,
      withOrgHeader(auth, org.slug)
    )
    const item = res.items.find(i => i.id === it.id)!
    expect(item.reactions.length).toBe(1)
    expect(item.reactions[0]!.emoji).toBe('👍')
    expect(item.reactions[0]!.count).toBe(2)
    expect(item.reactions[0]!.mine).toBe(true)
  })

  it('excludes soft-deleted items', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const live = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id, body_md: 'live' })
    const dead = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id, body_md: 'dead' })
    await sql`UPDATE messages_items SET deleted_at = now() WHERE id = ${dead.id}`

    const res = await $fetch<ItemsResponse>(`/api/messages/conversations/${ch.id}/items`, withOrgHeader(auth, org.slug))
    expect(res.items.map(i => i.id)).toContain(live.id)
    expect(res.items.map(i => i.id)).not.toContain(dead.id)
  })

  it('returns 404 for an unknown conversation id', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/conversations/00000000-0000-0000-0000-000000000000/items', {
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
