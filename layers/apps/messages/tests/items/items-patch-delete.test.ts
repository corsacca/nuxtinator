// PATCH /api/messages/items/:id   author-only edit
// DELETE /api/messages/items/:id   soft-delete (author OR admin)
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupMessagesTestData,
  createMessagesOrgWith,
  addMessagesMember,
  createTestChannel,
  createTestItem,
  withOrgHeader
} from '../helpers'

describe('PATCH /api/messages/items/:id', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('author updates body_md and edited_at is stamped', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id, body_md: 'orig' })

    await $fetch(`/api/messages/items/${it.id}`, {
      method: 'PATCH',
      body: { body_md: 'edited' },
      ...withOrgHeader(auth, org.slug)
    })

    const rows = await sql<{ body_md: string | null, edited_at: Date | null }[]>`
      SELECT body_md, edited_at FROM messages_items WHERE id = ${it.id}
    `
    expect(rows[0]!.body_md).toBe('edited')
    expect(rows[0]!.edited_at).not.toBeNull()
  })

  it('non-author gets 403 even if they have messages.write', async () => {
    const { org, user: author } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: author.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: author.id })

    const err = await $fetch(`/api/messages/items/${it.id}`, {
      method: 'PATCH',
      body: { body_md: 'hijack' },
      ...withOrgHeader(other.auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('returns 404 for unknown / deleted items', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })
    await sql`UPDATE messages_items SET deleted_at = now() WHERE id = ${it.id}`

    const err = await $fetch(`/api/messages/items/${it.id}`, {
      method: 'PATCH',
      body: { body_md: 'x' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })

  it('rejects editing a non-markdown item with 400', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    // Insert an image item directly.
    const id = crypto.randomUUID()
    await sql`
      INSERT INTO messages_items (id, conversation_id, author_id, kind, storage_key, filename, mime, size_bytes, org_id)
      VALUES (${id}, ${ch.id}, ${user.id}, 'image', 'k', 'f.png', 'image/png', 100, ${org.id})
    `
    const err = await $fetch(`/api/messages/items/${id}`, {
      method: 'PATCH',
      body: { body_md: 'x' },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})

describe('DELETE /api/messages/items/:id', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('author soft-deletes the item (deleted_at set)', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: user.id })

    await $fetch(`/api/messages/items/${it.id}`, { method: 'DELETE', ...withOrgHeader(auth, org.slug) })

    const rows = await sql<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM messages_items WHERE id = ${it.id}
    `
    expect(rows[0]!.deleted_at).not.toBeNull()
  })

  it('non-author member gets 403', async () => {
    const { org, user: author } = await createMessagesOrgWith(sql, ['admin'])
    const member = await addMessagesMember(sql, org.id, ['member'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: author.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: author.id })

    const err = await $fetch(`/api/messages/items/${it.id}`, {
      method: 'DELETE',
      ...withOrgHeader(member.auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('admin (non-author) can delete', async () => {
    // Two-admin org. Admin#2 deletes an item authored by Admin#1.
    const { org, user: author } = await createMessagesOrgWith(sql, ['admin'])
    const admin2 = await addMessagesMember(sql, org.id, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: author.id })
    const it = await createTestItem(sql, { org_id: org.id, conversation_id: ch.id, author_id: author.id })

    await $fetch(`/api/messages/items/${it.id}`, { method: 'DELETE', ...withOrgHeader(admin2.auth, org.slug) })

    const rows = await sql<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM messages_items WHERE id = ${it.id}
    `
    expect(rows[0]!.deleted_at).not.toBeNull()
  })

  it('returns 404 for unknown item', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/items/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
