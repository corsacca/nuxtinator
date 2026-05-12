// POST/DELETE /api/messages/reactions
// Add/remove a reaction on an item or comment.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupMessagesTestData,
  createMessagesOrgWith,
  createTestChannel,
  createTestItem,
  createTestComment,
  withOrgHeader
} from '../helpers'

describe('POST /api/messages/reactions', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('adds a reaction to an item; idempotent', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })

    await $fetch('/api/messages/reactions', {
      method: 'POST',
      body: { target_kind: 'item', target_id: it.id, emoji: '👍' },
      ...withOrgHeader(auth, org.slug)
    })
    await $fetch('/api/messages/reactions', {
      method: 'POST',
      body: { target_kind: 'item', target_id: it.id, emoji: '👍' },
      ...withOrgHeader(auth, org.slug)
    })

    const rows = await sql<{ emoji: string }[]>`
      SELECT emoji FROM messages_reactions
      WHERE target_kind = 'item' AND target_id = ${it.id} AND user_id = ${user.id}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.emoji).toBe('👍')
  })

  it('adds a reaction to a comment', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const c = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id })

    await $fetch('/api/messages/reactions', {
      method: 'POST',
      body: { target_kind: 'comment', target_id: c.id, emoji: '🎉' },
      ...withOrgHeader(auth, org.slug)
    })

    const rows = await sql<{ emoji: string }[]>`
      SELECT emoji FROM messages_reactions
      WHERE target_kind = 'comment' AND target_id = ${c.id}
    `
    expect(rows[0]!.emoji).toBe('🎉')
  })

  it('returns 404 for an unknown item target', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/reactions', {
      method: 'POST',
      body: { target_kind: 'item', target_id: '00000000-0000-0000-0000-000000000000', emoji: '👍' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('returns 400 for invalid body', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/reactions', {
      method: 'POST',
      body: { target_kind: 'bogus', target_id: 'nope', emoji: '' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})

describe('DELETE /api/messages/reactions', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('removes the caller-owned reaction', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })

    await $fetch('/api/messages/reactions', {
      method: 'POST',
      body: { target_kind: 'item', target_id: it.id, emoji: '👍' },
      ...withOrgHeader(auth, org.slug)
    })
    await $fetch('/api/messages/reactions', {
      method: 'DELETE',
      body: { target_kind: 'item', target_id: it.id, emoji: '👍' },
      ...withOrgHeader(auth, org.slug)
    })

    const rows = await sql<{ emoji: string }[]>`
      SELECT emoji FROM messages_reactions
      WHERE target_kind = 'item' AND target_id = ${it.id} AND user_id = ${user.id}
    `
    expect(rows.length).toBe(0)
  })

  it('no-op when the reaction never existed (200)', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const res = await $fetch('/api/messages/reactions', {
      method: 'DELETE',
      body: { target_kind: 'item', target_id: it.id, emoji: '👍' },
      ...withOrgHeader(auth, org.slug)
    })
    expect((res as { ok: boolean }).ok).toBe(true)
  })
})
