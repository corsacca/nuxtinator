// Comments: POST/GET, PATCH (author-only), DELETE (author or admin), resolve toggle.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
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

describe('POST /api/messages/items/:id/comments', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('creates a top-level comment with body_md', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })

    const res = await $fetch<{ id: string }>(
      `/api/messages/items/${it.id}/comments`,
      { method: 'POST', body: { body_md: 'first!' }, ...withOrgHeader(auth, org.slug) }
    )
    const rows = await sql<{ body_md: string, parent_comment_id: string | null }[]>`
      SELECT body_md, parent_comment_id FROM messages_comments WHERE id = ${res.id}
    `
    expect(rows[0]!.body_md).toBe('first!')
    expect(rows[0]!.parent_comment_id).toBeNull()
  })

  it('creates a reply to a top-level comment', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const parent = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id })

    const res = await $fetch<{ id: string }>(
      `/api/messages/items/${it.id}/comments`,
      {
        method: 'POST',
        body: { body_md: 'reply', parent_comment_id: parent.id },
        ...withOrgHeader(auth, org.slug)
      }
    )
    const rows = await sql<{ parent_comment_id: string | null }[]>`
      SELECT parent_comment_id FROM messages_comments WHERE id = ${res.id}
    `
    expect(rows[0]!.parent_comment_id).toBe(parent.id)
  })

  it('rejects depth-2 replies (parent itself is a reply) with 400', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const top = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id })
    const reply = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id, parent_comment_id: top.id })

    const err = await $fetch(`/api/messages/items/${it.id}/comments`, {
      method: 'POST',
      body: { body_md: 'second-level', parent_comment_id: reply.id },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('rejects parent_comment_id that belongs to a different item with 400', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const a = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const b = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const parent = await createTestComment(sql, { org_id: org.id, item_id: a.id, author_id: user.id })

    const err = await $fetch(`/api/messages/items/${b.id}/comments`, {
      method: 'POST',
      body: { body_md: 'wrong', parent_comment_id: parent.id },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('drops anchor on a non-markdown item (silently sets it to null, returns 200)', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    // image item
    const id = crypto.randomUUID()
    await sql`
      INSERT INTO messages_items (id, conversation_id, author_id, kind, storage_key, filename, mime, size_bytes, org_id)
      VALUES (${id}, ${ch.id}, ${user.id}, 'image', 'k', 'f.png', 'image/png', 100, ${org.id})
    `
    const res = await $fetch<{ id: string }>(
      `/api/messages/items/${id}/comments`,
      {
        method: 'POST',
        body: { body_md: 'on the image', anchor: { quote: 'q', prefix: '', suffix: '', start: 0, end: 1 } },
        ...withOrgHeader(auth, org.slug)
      }
    )
    const rows = await sql<{ anchor: unknown }[]>`
      SELECT anchor FROM messages_comments WHERE id = ${res.id}
    `
    expect(rows[0]!.anchor).toBeNull()
  })
})

describe('GET /api/messages/items/:id/comments', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('returns comments ASC including replies, excluding deleted', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const c1 = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id, body_md: 'first' })
    await new Promise(r => setTimeout(r, 10))
    const c2 = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id, body_md: 'second' })
    const dead = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id, body_md: 'deleted' })
    await sql`UPDATE messages_comments SET deleted_at = now() WHERE id = ${dead.id}`

    const res = await $fetch<{ comments: Array<{ id: string, body_md: string }> }>(
      `/api/messages/items/${it.id}/comments`,
      withOrgHeader(auth, org.slug)
    )
    expect(res.comments.length).toBe(2)
    expect(res.comments.map(c => c.id)).toEqual([c1.id, c2.id])
  })
})

describe('PATCH /api/messages/comments/:id', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('author edits body_md', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const c = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id, body_md: 'orig' })

    await $fetch(`/api/messages/comments/${c.id}`, {
      method: 'PATCH',
      body: { body_md: 'edited' },
      ...withOrgHeader(auth, org.slug)
    })

    const rows = await sql<{ body_md: string, edited_at: Date | null }[]>`
      SELECT body_md, edited_at FROM messages_comments WHERE id = ${c.id}
    `
    expect(rows[0]!.body_md).toBe('edited')
    expect(rows[0]!.edited_at).not.toBeNull()
  })

  it('non-author gets 403', async () => {
    const { org, user: author } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: author.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: author.id })
    const c = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: author.id })

    const err = await $fetch(`/api/messages/comments/${c.id}`, {
      method: 'PATCH',
      body: { body_md: 'hijack' },
      ...withOrgHeader(other.auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })
})

describe('DELETE /api/messages/comments/:id', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('author soft-deletes', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const c = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id })

    await $fetch(`/api/messages/comments/${c.id}`, { method: 'DELETE', ...withOrgHeader(auth, org.slug) })

    const rows = await sql<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM messages_comments WHERE id = ${c.id}
    `
    expect(rows[0]!.deleted_at).not.toBeNull()
  })

  it('admin (non-author) can delete', async () => {
    const { org, user: author } = await createMessagesOrgWith(sql, ['admin'])
    const admin2 = await addMessagesMember(sql, org.id, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: author.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: author.id })
    const c = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: author.id })

    await $fetch(`/api/messages/comments/${c.id}`, { method: 'DELETE', ...withOrgHeader(admin2.auth, org.slug) })

    const rows = await sql<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM messages_comments WHERE id = ${c.id}
    `
    expect(rows[0]!.deleted_at).not.toBeNull()
  })

  it('plain member (non-author) gets 403', async () => {
    const { org, user: author } = await createMessagesOrgWith(sql, ['admin'])
    const m = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: author.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: author.id })
    const c = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: author.id })

    const err = await $fetch(`/api/messages/comments/${c.id}`, {
      method: 'DELETE',
      ...withOrgHeader(m.auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })
})

describe('POST /api/messages/comments/:id/resolve', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('any participant can toggle resolved on/off', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    const c = await createTestComment(sql, { org_id: org.id, item_id: it.id, author_id: user.id })

    await $fetch(`/api/messages/comments/${c.id}/resolve`, {
      method: 'POST',
      body: { resolved: true },
      ...withOrgHeader(auth, org.slug)
    })
    let rows = await sql<{ resolved_at: Date | null, resolved_by: string | null }[]>`
      SELECT resolved_at, resolved_by FROM messages_comments WHERE id = ${c.id}
    `
    expect(rows[0]!.resolved_at).not.toBeNull()
    expect(rows[0]!.resolved_by).toBe(user.id)

    await $fetch(`/api/messages/comments/${c.id}/resolve`, {
      method: 'POST',
      body: { resolved: false },
      ...withOrgHeader(auth, org.slug)
    })
    rows = await sql<{ resolved_at: Date | null, resolved_by: string | null }[]>`
      SELECT resolved_at, resolved_by FROM messages_comments WHERE id = ${c.id}
    `
    expect(rows[0]!.resolved_at).toBeNull()
    expect(rows[0]!.resolved_by).toBeNull()
  })
})
