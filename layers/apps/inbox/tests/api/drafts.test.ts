// Shared drafts: create/update/promote/delete via the one messages endpoint,
// the conversation-scoped guards, and the detail payload's separate `drafts`
// array (drafts never appear in the thread `messages` list).
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith, postInbound } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function sender(tag = 'draft') {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

interface Detail {
  messages: Array<{ id: string, status: string, bodyHtml: string | null }>
  drafts: Array<{ id: string, bodyHtml: string | null }>
}

describe('shared drafts', () => {
  it('creates, updates, and promotes a draft (kept out of the thread until sent)', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const res = await postInbound({ recipient: `hello@${domain}`, from: `J <${sender()}>` })
    const id = res.body.conversation_id as string

    const draft = await $fetch<{ id: string, status: string }>(`/api/inbox/conversations/${id}/messages`, {
      method: 'POST', body: { saveDraft: true, body: '<p>work in progress</p>' }, ...opts
    })
    expect(draft.status).toBe('draft')

    let detail = await $fetch<Detail>(`/api/inbox/conversations/${id}`, opts)
    expect(detail.drafts.map(d => d.id)).toContain(draft.id)
    // Drafts are excluded from the thread message list.
    expect(detail.messages.map(m => m.id)).not.toContain(draft.id)
    expect(detail.drafts[0]!.bodyHtml).toContain('work in progress')

    await $fetch(`/api/inbox/conversations/${id}/messages`, {
      method: 'POST', body: { saveDraft: true, draftId: draft.id, body: '<p>updated</p>' }, ...opts
    })
    detail = await $fetch<Detail>(`/api/inbox/conversations/${id}`, opts)
    expect(detail.drafts.find(d => d.id === draft.id)!.bodyHtml).toContain('updated')

    // Promote (send with no new body → sends the stored draft, same row).
    const sent = await $fetch<{ id: string, status: string }>(`/api/inbox/conversations/${id}/messages`, {
      method: 'POST', body: { draftId: draft.id }, ...opts
    })
    expect(sent.id).toBe(draft.id)
    expect(sent.status).toBe('queued')

    detail = await $fetch<Detail>(`/api/inbox/conversations/${id}`, opts)
    expect(detail.drafts).toHaveLength(0)
    expect(detail.messages.map(m => m.id)).toContain(draft.id)
    expect(detail.messages.find(m => m.id === draft.id)!.bodyHtml).toContain('updated')
  })

  it('scopes draft delete to its conversation and to draft status', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const res = await postInbound({ recipient: `hello@${domain}`, from: `J <${sender('del')}>` })
    const id = res.body.conversation_id as string
    const other = await postInbound({ recipient: `hello@${domain}`, from: `K <${sender('other')}>` })

    const draft = await $fetch<{ id: string }>(`/api/inbox/conversations/${id}/messages`, {
      method: 'POST', body: { saveDraft: true, body: '<p>x</p>' }, ...opts
    })

    // Wrong conversation URL can't delete it.
    await expect(
      $fetch(`/api/inbox/conversations/${other.body.conversation_id}/drafts/${draft.id}`, { method: 'DELETE', ...opts })
    ).rejects.toMatchObject({ statusCode: 404 })

    const del = await $fetch<{ success: boolean }>(`/api/inbox/conversations/${id}/drafts/${draft.id}`, { method: 'DELETE', ...opts })
    expect(del.success).toBe(true)

    // Gone — a second delete 404s.
    await expect(
      $fetch(`/api/inbox/conversations/${id}/drafts/${draft.id}`, { method: 'DELETE', ...opts })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
