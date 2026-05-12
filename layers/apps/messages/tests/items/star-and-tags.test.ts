// POST/DELETE /api/messages/items/:id/star and /tags
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupMessagesTestData,
  createMessagesOrgWith,
  createTestChannel,
  createTestItem,
  withOrgHeader
} from '../helpers'

describe('POST/DELETE /api/messages/items/:id/star', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('star creates a row; unstar removes it; both idempotent', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })

    await $fetch(`/api/messages/items/${it.id}/star`, { method: 'POST', ...withOrgHeader(auth, org.slug) })
    // double POST — must not error
    await $fetch(`/api/messages/items/${it.id}/star`, { method: 'POST', ...withOrgHeader(auth, org.slug) })

    let rows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM messages_item_stars WHERE user_id = ${user.id} AND item_id = ${it.id}
    `
    expect(rows.length).toBe(1)

    await $fetch(`/api/messages/items/${it.id}/star`, { method: 'DELETE', ...withOrgHeader(auth, org.slug) })
    rows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM messages_item_stars WHERE user_id = ${user.id} AND item_id = ${it.id}
    `
    expect(rows.length).toBe(0)
  })

  it('star returns 404 for unknown / deleted item', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/items/00000000-0000-0000-0000-000000000000/star', {
      method: 'POST',
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})

describe('POST/DELETE /api/messages/items/:id/tags', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('tagging an item adds to the user vocabulary + the item', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })

    await $fetch(`/api/messages/items/${it.id}/tags`, {
      method: 'POST',
      body: { tag: 'todo' },
      ...withOrgHeader(auth, org.slug)
    })

    const vocab = await sql<{ tag_name: string }[]>`
      SELECT tag_name FROM messages_user_tags WHERE user_id = ${user.id}
    `
    expect(vocab.map(t => t.tag_name)).toContain('todo')

    const apps = await sql<{ tag_name: string }[]>`
      SELECT tag_name FROM messages_item_tags WHERE user_id = ${user.id} AND item_id = ${it.id}
    `
    expect(apps.map(t => t.tag_name)).toContain('todo')
  })

  it('strips a leading # from the tag', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })

    await $fetch(`/api/messages/items/${it.id}/tags`, {
      method: 'POST',
      body: { tag: '#hash' },
      ...withOrgHeader(auth, org.slug)
    })
    const apps = await sql<{ tag_name: string }[]>`
      SELECT tag_name FROM messages_item_tags WHERE user_id = ${user.id} AND item_id = ${it.id}
    `
    expect(apps[0]!.tag_name).toBe('hash')
  })

  it('untagging an item leaves the vocabulary row alone but removes the item tag', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    await $fetch(`/api/messages/items/${it.id}/tags`, { method: 'POST', body: { tag: 'todo' }, ...withOrgHeader(auth, org.slug) })

    await $fetch(`/api/messages/items/${it.id}/tags`, { method: 'DELETE', body: { tag: 'todo' }, ...withOrgHeader(auth, org.slug) })

    const apps = await sql<{ tag_name: string }[]>`
      SELECT tag_name FROM messages_item_tags WHERE user_id = ${user.id} AND item_id = ${it.id}
    `
    expect(apps.length).toBe(0)

    const vocab = await sql<{ tag_name: string }[]>`
      SELECT tag_name FROM messages_user_tags WHERE user_id = ${user.id} AND tag_name = 'todo'
    `
    expect(vocab.length).toBe(1)
  })
})
