import { describe, it, expect, afterEach } from 'vitest'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupFilesTestData,
  createFilesOrgWith,
  createTestDoc,
  createTestFile,
  withOrgHeader
} from './helpers'

const sql = getHostAdminDb()

describe('files layer', () => {
  afterEach(async () => { await cleanupFilesTestData(sql) })

  it('creates a document with an initial version', async () => {
    const { org, auth } = await createFilesOrgWith(sql)
    const res = await $fetch<{ item: { id: string, kind: string, title: string } }>(
      '/api/files/items',
      { method: 'POST', body: { title: 'My Doc', body_md: '# Hi' }, ...withOrgHeader(auth, org.slug) }
    )
    expect(res.item.id).toBeDefined()
    expect(res.item.kind).toBe('doc')

    const versions = await sql`SELECT id FROM files_versions WHERE item_id = ${res.item.id}`
    expect(versions.length).toBe(1)
  })

  it('lists items and fetches one with body', async () => {
    const { org, user, auth } = await createFilesOrgWith(sql)
    const { id } = await createTestDoc(sql, { org_id: org.id, created_by: user.id, title: 'Listed', body_md: 'body here' })

    const list = await $fetch<{ items: Array<{ id: string }> }>(
      '/api/files/items', { ...withOrgHeader(auth, org.slug) }
    )
    expect(list.items.some(i => i.id === id)).toBe(true)

    const one = await $fetch<{ item: { body_md: string } }>(
      `/api/files/items/${id}`, { ...withOrgHeader(auth, org.slug) }
    )
    expect(one.item.body_md).toBe('body here')
  })

  it('editing a doc creates a new version snapshot', async () => {
    const { org, user, auth } = await createFilesOrgWith(sql)
    const { id } = await createTestDoc(sql, { org_id: org.id, created_by: user.id, body_md: 'v1' })

    await $fetch(`/api/files/items/${id}`, {
      method: 'PATCH', body: { body_md: 'v2 edited' }, ...withOrgHeader(auth, org.slug)
    })

    const versions = await $fetch<{ versions: Array<{ content: string }> }>(
      `/api/files/items/${id}/versions`, { ...withOrgHeader(auth, org.slug) }
    )
    // initial seed version + the edit
    expect(versions.versions.length).toBe(2)
    expect(versions.versions[0]!.content).toBe('v2 edited')
  })

  it('restores a past version as a new head version', async () => {
    const { org, user, auth } = await createFilesOrgWith(sql)
    const { id } = await createTestDoc(sql, { org_id: org.id, created_by: user.id, body_md: 'original' })
    await $fetch(`/api/files/items/${id}`, {
      method: 'PATCH', body: { body_md: 'changed' }, ...withOrgHeader(auth, org.slug)
    })

    const before = await $fetch<{ versions: Array<{ id: string, content: string }> }>(
      `/api/files/items/${id}/versions`, { ...withOrgHeader(auth, org.slug) }
    )
    const original = before.versions.find(v => v.content === 'original')!

    await $fetch(`/api/files/items/${id}/versions/${original.id}/restore`, {
      method: 'POST', ...withOrgHeader(auth, org.slug)
    })

    const item = await $fetch<{ item: { body_md: string } }>(
      `/api/files/items/${id}`, { ...withOrgHeader(auth, org.slug) }
    )
    expect(item.item.body_md).toBe('original')
  })

  it('issues, then revokes, a public share link', async () => {
    const { org, user, auth } = await createFilesOrgWith(sql)
    const { id } = await createTestDoc(sql, { org_id: org.id, created_by: user.id })

    const issued = await $fetch<{ share_token: string }>(
      `/api/files/items/${id}/share`, { method: 'POST', ...withOrgHeader(auth, org.slug) }
    )
    expect(issued.share_token).toMatch(/^[0-9a-f-]{36}$/)

    await $fetch(`/api/files/items/${id}/share`, { method: 'DELETE', ...withOrgHeader(auth, org.slug) })
    const row = await sql`SELECT share_token FROM files_items WHERE id = ${id}`
    expect(row[0]!.share_token).toBeNull()
  })

  it('serves a doc via the public link with no auth, and 404s after revoke', async () => {
    const { org, user, auth } = await createFilesOrgWith(sql)
    const { id } = await createTestDoc(sql, { org_id: org.id, created_by: user.id, title: 'Public Doc', body_md: 'public body' })
    const issued = await $fetch<{ share_token: string }>(
      `/api/files/items/${id}/share`, { method: 'POST', ...withOrgHeader(auth, org.slug) }
    )

    // No auth headers at all.
    const pub = await $fetch<{ kind: string, title: string, body_md: string }>(
      `/api/files/public/${issued.share_token}`
    )
    expect(pub.kind).toBe('doc')
    expect(pub.body_md).toBe('public body')

    await $fetch(`/api/files/items/${id}/share`, { method: 'DELETE', ...withOrgHeader(auth, org.slug) })
    const res = await fetch(`/api/files/public/${issued.share_token}`)
    expect(res.status).toBe(404)
  })

  it('public link returns a signed url for a file', async () => {
    const { org, user, auth } = await createFilesOrgWith(sql)
    const { id } = await createTestFile(sql, { org_id: org.id, created_by: user.id, filename: 'pic.png', mime: 'image/png' })
    const issued = await $fetch<{ share_token: string }>(
      `/api/files/items/${id}/share`, { method: 'POST', ...withOrgHeader(auth, org.slug) }
    )
    const pub = await $fetch<{ kind: string, url: string | null, mime: string }>(
      `/api/files/public/${issued.share_token}`
    )
    expect(pub.kind).toBe('file')
    expect(pub.mime).toBe('image/png')
    expect(pub.url).toBeTruthy()
  })

  it('soft-deletes an item (subsequent GET 404s)', async () => {
    const { org, user, auth } = await createFilesOrgWith(sql)
    const { id } = await createTestDoc(sql, { org_id: org.id, created_by: user.id })

    await $fetch(`/api/files/items/${id}`, { method: 'DELETE', ...withOrgHeader(auth, org.slug) })
    const res = await fetch(`/api/files/items/${id}`, { ...withOrgHeader(auth, org.slug) })
    expect(res.status).toBe(404)
  })

  it('full-text search finds a doc by body', async () => {
    const { org, user, auth } = await createFilesOrgWith(sql)
    await createTestDoc(sql, { org_id: org.id, created_by: user.id, title: 'Findable', body_md: 'a rare quetzal appears' })

    const res = await $fetch<{ items: Array<{ title: string }> }>(
      '/api/files/search', { query: { q: 'quetzal' }, ...withOrgHeader(auth, org.slug) }
    )
    expect(res.items.some(i => i.title === 'Findable')).toBe(true)
  })

  it('isolates items across orgs (RLS)', async () => {
    const a = await createFilesOrgWith(sql)
    const { id } = await createTestDoc(sql, { org_id: a.org.id, created_by: a.user.id })

    const b = await createFilesOrgWith(sql)
    // B's admin, scoped to B's org, must not see A's item.
    const list = await $fetch<{ items: Array<{ id: string }> }>(
      '/api/files/items', { ...withOrgHeader(b.auth, b.org.slug) }
    )
    expect(list.items.some(i => i.id === id)).toBe(false)

    const res = await fetch(`/api/files/items/${id}`, { ...withOrgHeader(b.auth, b.org.slug) })
    expect(res.status).toBe(404)
  })

  it('rejects an upload with no file part (400)', async () => {
    const { org, auth } = await createFilesOrgWith(sql)
    const res = await fetch('/api/files/uploads', { method: 'POST', ...withOrgHeader(auth, org.slug) })
    expect(res.status).toBe(400)
  })

  it('returns 404 (not 500) for a non-UUID item id', async () => {
    const { org, auth } = await createFilesOrgWith(sql)
    const res = await fetch('/api/files/items/not-a-uuid', { ...withOrgHeader(auth, org.slug) })
    expect(res.status).toBe(404)
  })

  it('public route 404s on a malformed token (no auth)', async () => {
    const res = await fetch('/api/files/public/not-a-uuid')
    expect(res.status).toBe(404)
  })

  it('nulls created_by when the creator is deleted (item survives)', async () => {
    const { org, user } = await createFilesOrgWith(sql)
    const { id } = await createTestDoc(sql, { org_id: org.id, created_by: user.id })

    // Must not throw (the old NOT NULL + SET NULL combo aborted this).
    await sql`DELETE FROM users WHERE id = ${user.id}`

    const rows = await sql`SELECT created_by FROM files_items WHERE id = ${id}`
    expect(rows.length).toBe(1)
    expect(rows[0]!.created_by).toBeNull()
  })
})
