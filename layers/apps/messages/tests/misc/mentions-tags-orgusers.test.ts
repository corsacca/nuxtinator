// Small read endpoints: mentions feed, tag vocabulary, org-users listing.
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

describe('GET /api/messages/mentions', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('returns items where the caller was mentioned', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const author = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: author.user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: author.user.id })

    // Seed a mention row directly.
    const mentionId = randomUUID()
    await sql`
      INSERT INTO messages_mentions (id, item_id, mentioned_user_id, org_id)
      VALUES (${mentionId}, ${it.id}, ${user.id}, ${org.id})
    `

    const res = await $fetch<{ mentions: Array<{ id: string, item_id: string | null }> }>(
      '/api/messages/mentions',
      withOrgHeader(auth, org.slug)
    )
    expect(res.mentions.find(m => m.id === mentionId)).toBeDefined()
  })

  it('does not leak mentions where the mentioned_user is somebody else', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const foreignId = randomUUID()
    await sql`
      INSERT INTO messages_mentions (id, item_id, mentioned_user_id, org_id)
      VALUES (${foreignId}, ${it.id}, ${other.user.id}, ${org.id})
    `

    const res = await $fetch<{ mentions: Array<{ id: string }> }>(
      '/api/messages/mentions',
      withOrgHeader(auth, org.slug)
    )
    expect(res.mentions.map(m => m.id)).not.toContain(foreignId)
  })
})

describe('GET /api/messages/tags', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('returns the caller\'s tag vocabulary in name-ASC order', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    await sql`
      INSERT INTO messages_user_tags (user_id, tag_name, org_id)
      VALUES (${user.id}, 'zzz', ${org.id}),
             (${user.id}, 'aaa', ${org.id})
    `
    const res = await $fetch<{ tags: Array<{ name: string }> }>(
      '/api/messages/tags',
      withOrgHeader(auth, org.slug)
    )
    expect(res.tags.map(t => t.name)).toEqual(['aaa', 'zzz'])
  })

  it('does not return another user\'s vocabulary', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    await sql`
      INSERT INTO messages_user_tags (user_id, tag_name, org_id)
      VALUES (${user.id},      'mine',  ${org.id}),
             (${other.user.id}, 'theirs', ${org.id})
    `
    const res = await $fetch<{ tags: Array<{ name: string }> }>(
      '/api/messages/tags',
      withOrgHeader(auth, org.slug)
    )
    expect(res.tags.map(t => t.name)).toEqual(['mine'])
  })
})

describe('GET /api/messages/org-users', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('returns members of the active org only', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    // Another org's user must not appear.
    const stranger = await createMessagesOrgWith(sql, ['admin'])

    const res = await $fetch<{ users: Array<{ id: string }> }>(
      '/api/messages/org-users',
      withOrgHeader(auth, org.slug)
    )
    const ids = res.users.map(u => u.id)
    expect(ids).toContain(user.id)
    expect(ids).toContain(other.user.id)
    expect(ids).not.toContain(stranger.user.id)
  })

  it('filters by ?q= against display_name + email (case-insensitive)', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const target = await addMessagesMember(sql, org.id, ['member'])
    // Set a known display name.
    await sql`UPDATE users SET display_name = 'Unique Banana Person' WHERE id = ${target.user.id}`

    const res = await $fetch<{ users: Array<{ id: string }> }>(
      '/api/messages/org-users?q=banana',
      withOrgHeader(auth, org.slug)
    )
    const ids = res.users.map(u => u.id)
    expect(ids).toContain(target.user.id)
    expect(ids).not.toContain(user.id)
  })
})
