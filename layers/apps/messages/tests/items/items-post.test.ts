// POST /api/messages/conversations/:id/items
// Creates an item (markdown or upload). Markdown bodies trigger mention
// fan-out — for each [@Name](uuid) link in body_md whose uuid corresponds
// to an org member, a messages_mentions row + messages_notifications row +
// per-event email is fired.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupMessagesTestData,
  createMessagesOrgWith,
  addMessagesMember,
  createTestChannel,
  createTestDm,
  withOrgHeader,
  clearMailhog,
  waitForMailTo
} from '../helpers'

describe('POST /api/messages/conversations/:id/items', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('creates a markdown item; row exists with body_md set', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })

    const res = await $fetch<{ id: string }>(
      `/api/messages/conversations/${ch.id}/items`,
      { method: 'POST', body: { kind: 'markdown', body_md: 'hello **world**' }, ...withOrgHeader(auth, org.slug) }
    )
    expect(res.id).toBeDefined()

    const rows = await sql<{ kind: string, body_md: string | null, author_id: string }[]>`
      SELECT kind, body_md, author_id FROM messages_items WHERE id = ${res.id}
    `
    expect(rows[0]!.kind).toBe('markdown')
    expect(rows[0]!.body_md).toBe('hello **world**')
    expect(rows[0]!.author_id).toBe(user.id)
  })

  it('creates an upload item with storage metadata', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })

    const res = await $fetch<{ id: string }>(
      `/api/messages/conversations/${ch.id}/items`,
      {
        method: 'POST',
        body: {
          kind: 'image',
          upload: { storage_key: 'k', filename: 'f.png', mime: 'image/png', size_bytes: 1234 }
        },
        ...withOrgHeader(auth, org.slug)
      }
    )

    const rows = await sql<{ kind: string, storage_key: string | null, filename: string | null, size_bytes: string | null }[]>`
      SELECT kind, storage_key, filename, size_bytes FROM messages_items WHERE id = ${res.id}
    `
    expect(rows[0]!.kind).toBe('image')
    expect(rows[0]!.storage_key).toBe('k')
    expect(rows[0]!.filename).toBe('f.png')
    expect(Number(rows[0]!.size_bytes)).toBe(1234)
  })

  it('rejects empty body_md with 400', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const err = await $fetch(`/api/messages/conversations/${ch.id}/items`, {
      method: 'POST',
      body: { kind: 'markdown', body_md: '' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('returns 404 when conversation not found', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/conversations/00000000-0000-0000-0000-000000000000/items', {
      method: 'POST',
      body: { kind: 'markdown', body_md: 'x' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('returns 403 when posting to a DM the caller is not a participant of', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const x = await addMessagesMember(sql, org.id, ['member'])
    const y = await addMessagesMember(sql, org.id, ['member'])
    const dm = await createTestDm(sql, { org_id: org.id, created_by: x.user.id, other_user_id: y.user.id })

    const err = await $fetch(`/api/messages/conversations/${dm.id}/items`, {
      method: 'POST',
      body: { kind: 'markdown', body_md: 'x' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  describe('mention fan-out', () => {
    beforeEach(async () => {
      await clearMailhog()
    })

    it('writes messages_mentions + messages_notifications rows for org members named in body_md', async () => {
      const { org, user: author, auth } = await createMessagesOrgWith(sql, ['admin'])
      const mentioned = await addMessagesMember(sql, org.id, ['member'])
      const ch = await createTestChannel(sql, { org_id: org.id, created_by: author.id })

      const body = `hey [@${mentioned.user.display_name}](${mentioned.user.id})`
      const res = await $fetch<{ id: string }>(
        `/api/messages/conversations/${ch.id}/items`,
        { method: 'POST', body: { kind: 'markdown', body_md: body }, ...withOrgHeader(auth, org.slug) }
      )

      const mentions = await sql<{ mentioned_user_id: string }[]>`
        SELECT mentioned_user_id FROM messages_mentions WHERE item_id = ${res.id}
      `
      expect(mentions.map(m => m.mentioned_user_id)).toEqual([mentioned.user.id])

      const notifs = await sql<{ kind: string }[]>`
        SELECT kind FROM messages_notifications
        WHERE user_id = ${mentioned.user.id} AND item_id = ${res.id}
      `
      expect(notifs.length).toBe(1)
      expect(notifs[0]!.kind).toBe('mention')

      // Per-event mention email lands in Mailpit.
      const mail = await waitForMailTo(mentioned.user.email, 8000)
      expect(mail.body.length).toBeGreaterThan(0)
    })

    it('does not write a self-mention row when author mentions themselves', async () => {
      const { org, user: author, auth } = await createMessagesOrgWith(sql, ['admin'])
      const ch = await createTestChannel(sql, { org_id: org.id, created_by: author.id })

      const body = `me: [@${author.display_name}](${author.id})`
      const res = await $fetch<{ id: string }>(
        `/api/messages/conversations/${ch.id}/items`,
        { method: 'POST', body: { kind: 'markdown', body_md: body }, ...withOrgHeader(auth, org.slug) }
      )

      const mentions = await sql<{ mentioned_user_id: string }[]>`
        SELECT mentioned_user_id FROM messages_mentions WHERE item_id = ${res.id}
      `
      expect(mentions.map(m => m.mentioned_user_id)).not.toContain(author.id)
    })
  })

  it('creates a per-event DM notification row for every other participant', async () => {
    const { org, user: a, auth } = await createMessagesOrgWith(sql, ['admin'])
    const b = await addMessagesMember(sql, org.id, ['member'])
    const dm = await createTestDm(sql, { org_id: org.id, created_by: a.id, other_user_id: b.user.id })

    const res = await $fetch<{ id: string }>(
      `/api/messages/conversations/${dm.id}/items`,
      { method: 'POST', body: { kind: 'markdown', body_md: 'yo' }, ...withOrgHeader(auth, org.slug) }
    )

    const notifs = await sql<{ user_id: string, kind: string }[]>`
      SELECT user_id, kind FROM messages_notifications WHERE item_id = ${res.id}
    `
    // Only the other participant (not the author).
    expect(notifs.length).toBe(1)
    expect(notifs[0]!.user_id).toBe(b.user.id)
    expect(notifs[0]!.kind).toBe('dm')
  })
})
