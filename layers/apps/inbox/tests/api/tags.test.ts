// Conversation tags: palette CRUD (idempotent create-by-slug), applying tags
// (sanitized against the palette), the tag filter, cross-status counts, and
// delete stripping the slug from the palette AND from conversations.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith, postInbound } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function sender(tag = 'tag') {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

describe('conversation tags', () => {
  it('manages a palette and applies tags, with filter/counts/delete', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const res = await postInbound({ recipient: `hello@${domain}`, from: `J <${sender()}>` })
    const id = res.body.conversation_id as string

    // Create — slug derived from the name.
    const t1 = await $fetch<{ tag: { slug: string, color: string } }>('/api/inbox/tags', {
      method: 'POST', body: { name: 'VIP Customer', color: 'success' }, ...opts
    })
    expect(t1.tag.slug).toBe('vip-customer')
    expect(t1.tag.color).toBe('success')

    // Idempotent by slug — a second create returns the existing tag unchanged.
    const t1b = await $fetch<{ tag: { slug: string, color: string } }>('/api/inbox/tags', {
      method: 'POST', body: { name: 'vip customer', color: 'error' }, ...opts
    })
    expect(t1b.tag.slug).toBe('vip-customer')
    expect(t1b.tag.color).toBe('success')

    const list = await $fetch<{ tags: Array<{ slug: string }> }>('/api/inbox/tags', opts)
    expect(list.tags.map(t => t.slug)).toContain('vip-customer')

    // Apply — an unknown slug is dropped silently; the response is sanitized.
    const put = await $fetch<{ tags: string[] }>(`/api/inbox/conversations/${id}/tags`, {
      method: 'PUT', body: { tags: ['vip-customer', 'not-a-tag'] }, ...opts
    })
    expect(put.tags).toEqual(['vip-customer'])

    const detail = await $fetch<{ conversation: { tags: string[] } }>(`/api/inbox/conversations/${id}`, opts)
    expect(detail.conversation.tags).toEqual(['vip-customer'])

    // Filter (containment) + cross-status counts.
    const filtered = await $fetch<{ items: Array<{ id: string, tags: string[] }> }>('/api/inbox/conversations?tag=vip-customer', opts)
    expect(filtered.items.map(i => i.id)).toContain(id)
    const counts = await $fetch<{ counts: Record<string, number> }>('/api/inbox/conversations/tag-counts', opts)
    expect(counts.counts['vip-customer']).toBe(1)

    // Delete — gone from the palette AND stripped off the conversation.
    await $fetch('/api/inbox/tags/vip-customer', { method: 'DELETE', ...opts })
    const afterList = await $fetch<{ tags: Array<{ slug: string }> }>('/api/inbox/tags', opts)
    expect(afterList.tags.map(t => t.slug)).not.toContain('vip-customer')
    const afterDetail = await $fetch<{ conversation: { tags: string[] } }>(`/api/inbox/conversations/${id}`, opts)
    expect(afterDetail.conversation.tags).toEqual([])
  })

  it('rejects a name that slugifies to nothing', async () => {
    const { opts } = await createInboxOrgWith(sql)
    await expect(
      $fetch('/api/inbox/tags', { method: 'POST', body: { name: '!!!' }, ...opts })
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
