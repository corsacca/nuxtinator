// Canned responses: create, title-sorted list, partial update (title-only
// leaves the body), delete, missing-snippet 404, and the inbox.send gate on
// management.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

describe('canned responses', () => {
  it('creates, lists title-sorted, updates partially, and deletes', async () => {
    const { opts } = await createInboxOrgWith(sql)

    const b = await $fetch<{ id: string, title: string, bodyHtml: string }>('/api/inbox/canned-responses', {
      method: 'POST', body: { title: 'Bravo', bodyHtml: '<p>b</p>' }, ...opts
    })
    const a = await $fetch<{ id: string }>('/api/inbox/canned-responses', {
      method: 'POST', body: { title: 'Alpha', bodyHtml: '<p>a</p>' }, ...opts
    })

    const list = await $fetch<{ items: Array<{ id: string, title: string }> }>('/api/inbox/canned-responses', opts)
    expect(list.items.map(i => i.title)).toEqual(['Alpha', 'Bravo'])

    // Partial: a title-only edit must not wipe the body.
    const upd = await $fetch<{ title: string, bodyHtml: string }>(`/api/inbox/canned-responses/${b.id}`, {
      method: 'PUT', body: { title: 'Bravo Two' }, ...opts
    })
    expect(upd.title).toBe('Bravo Two')
    expect(upd.bodyHtml).toBe('<p>b</p>')

    await $fetch(`/api/inbox/canned-responses/${a.id}`, { method: 'DELETE', ...opts })
    const after = await $fetch<{ items: Array<{ id: string }> }>('/api/inbox/canned-responses', opts)
    expect(after.items.map(i => i.id)).not.toContain(a.id)
    expect(after.items.map(i => i.id)).toContain(b.id)
  })

  it('404s updating a missing snippet', async () => {
    const { opts } = await createInboxOrgWith(sql)
    await expect(
      $fetch(`/api/inbox/canned-responses/${randomUUID()}`, { method: 'PUT', body: { title: 'x' }, ...opts })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('forbids management without inbox.send', async () => {
    const { opts } = await createInboxOrgWith(sql, ['member'])
    await expect(
      $fetch('/api/inbox/canned-responses', { method: 'POST', body: { title: 'x' }, ...opts })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
