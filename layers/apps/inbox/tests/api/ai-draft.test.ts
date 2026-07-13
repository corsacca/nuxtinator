// Inbox AI: draft-reply (generate preview + save verbatim + the ai_generated
// regenerate guard), knowledge suggest/CRUD, and grounding refresh. The
// #ai/server client stubs the network under VITEST, so these run without a key.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith, setInboxOrgSetting, postInbound } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function sender(tag = 'ai') {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

async function seedConversation(domain: string): Promise<string> {
  const res = await postInbound({ recipient: `hello@${domain}`, from: `J <${sender()}>`, text: 'How much does it cost?' })
  return res.body.conversation_id as string
}

interface Detail {
  drafts: Array<{ id: string, bodyHtml: string | null, aiGenerated: boolean, aiMetadata: { gloss: string } | null }>
  messages: Array<{ id: string, aiGenerated: boolean }>
}
async function detail(id: string, opts: object): Promise<Detail> {
  return await $fetch<Detail>(`/api/inbox/conversations/${id}`, opts)
}

describe('inbox AI draft-reply', () => {
  it('generates a draft preview without persisting', async () => {
    const { domain, opts } = await createInboxOrgWith(sql)
    const id = await seedConversation(domain)
    const res = await $fetch<{ preview: boolean, draft_html: string, draft_text: string }>(
      `/api/inbox/conversations/${id}/draft-reply`,
      { method: 'POST', body: {}, ...opts }
    )
    expect(res.preview).toBe(true)
    expect(res.draft_html).toBeTruthy()
    expect(res.draft_text).toBeTruthy()
    // Preview persists nothing.
    expect((await detail(id, opts)).drafts).toHaveLength(0)
  })

  it('saves a reviewed draft as an ai_generated draft with metadata', async () => {
    const { domain, opts } = await createInboxOrgWith(sql)
    const id = await seedConversation(domain)
    const saved = await $fetch<{ id: string, ai: boolean }>(
      `/api/inbox/conversations/${id}/draft-reply`,
      { method: 'POST', body: { save: { html: '<p>Reviewed reply</p>', text: 'Reviewed reply', language: 'en', gloss: 'Reviewed reply', sources: [], uncertainty: [] } }, ...opts }
    )
    expect(saved.ai).toBe(true)
    const d = (await detail(id, opts)).drafts.find(x => x.id === saved.id)!
    expect(d.aiGenerated).toBe(true)
    expect(d.bodyHtml).toContain('Reviewed reply')
    expect(d.aiMetadata?.gloss).toBe('Reviewed reply')
  })

  it('never overwrites a human draft (guard falls through to a new draft)', async () => {
    const { domain, opts } = await createInboxOrgWith(sql)
    const id = await seedConversation(domain)
    // A human draft via the normal composer path.
    const human = await $fetch<{ id: string }>(
      `/api/inbox/conversations/${id}/messages`,
      { method: 'POST', body: { saveDraft: true, body: '<p>Human wording</p>' }, ...opts }
    )
    // Saving an AI draft with the human draft's id must NOT clobber it.
    const saved = await $fetch<{ id: string }>(
      `/api/inbox/conversations/${id}/draft-reply`,
      { method: 'POST', body: { draftId: human.id, save: { html: '<p>AI wording</p>' } }, ...opts }
    )
    expect(saved.id).not.toBe(human.id)
    const humanDraft = (await detail(id, opts)).drafts.find(x => x.id === human.id)!
    expect(humanDraft.bodyHtml).toContain('Human wording')
    expect(humanDraft.aiGenerated).toBe(false)
  })

  it('regenerates into the same ai draft slot', async () => {
    const { domain, opts } = await createInboxOrgWith(sql)
    const id = await seedConversation(domain)
    const first = await $fetch<{ id: string }>(
      `/api/inbox/conversations/${id}/draft-reply`,
      { method: 'POST', body: { save: { html: '<p>version one</p>' } }, ...opts }
    )
    const second = await $fetch<{ id: string }>(
      `/api/inbox/conversations/${id}/draft-reply`,
      { method: 'POST', body: { draftId: first.id, save: { html: '<p>version two</p>' } }, ...opts }
    )
    expect(second.id).toBe(first.id)
    const d = (await detail(id, opts)).drafts.find(x => x.id === first.id)!
    expect(d.bodyHtml).toContain('version two')
  })

  it('requires inbox.send', async () => {
    const member = await createInboxOrgWith(sql, ['member'])
    const id = await seedConversation(member.domain)
    await expect(
      $fetch(`/api/inbox/conversations/${id}/draft-reply`, { method: 'POST', body: {}, ...member.opts })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('inbox knowledge base', () => {
  it('suggests an entry without persisting', async () => {
    const { domain, opts } = await createInboxOrgWith(sql)
    const id = await seedConversation(domain)
    const res = await $fetch<{ question: string, answer: string, removed: string[] }>(
      `/api/inbox/conversations/${id}/knowledge-entry/suggest`,
      { method: 'POST', body: {}, ...opts }
    )
    expect(res.question).toBeTruthy()
    expect(res.answer).toBeTruthy()
    const list = await $fetch<{ entries: unknown[] }>('/api/inbox/knowledge-entries', opts)
    expect(list.entries).toHaveLength(0)
  })

  it('creates, lists, archives, and deletes entries', async () => {
    const { opts } = await createInboxOrgWith(sql)
    const created = await $fetch<{ entry: { id: string, question: string, status: string } }>(
      '/api/inbox/knowledge-entries',
      { method: 'POST', body: { question: 'How do refunds work?', answer: 'Within 30 days.' }, ...opts }
    )
    expect(created.entry.question).toBe('How do refunds work?')

    const active = await $fetch<{ entries: { id: string }[] }>('/api/inbox/knowledge-entries?status=active', opts)
    expect(active.entries.map(e => e.id)).toContain(created.entry.id)

    await $fetch(`/api/inbox/knowledge-entries/${created.entry.id}`, { method: 'PUT', body: { status: 'archived' }, ...opts })
    const afterArchive = await $fetch<{ entries: { id: string }[] }>('/api/inbox/knowledge-entries?status=active', opts)
    expect(afterArchive.entries.map(e => e.id)).not.toContain(created.entry.id)

    await $fetch(`/api/inbox/knowledge-entries/${created.entry.id}`, { method: 'DELETE', ...opts })
    const all = await $fetch<{ entries: unknown[] }>('/api/inbox/knowledge-entries', opts)
    expect(all.entries).toHaveLength(0)
  })

  it('gates writes behind inbox.send', async () => {
    const member = await createInboxOrgWith(sql, ['member'])
    await expect(
      $fetch('/api/inbox/knowledge-entries', { method: 'POST', body: { question: 'q', answer: 'a' }, ...member.opts })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('inbox grounding refresh', () => {
  it('syncs configured source urls (stubbed under VITEST)', async () => {
    const { org, opts } = await createInboxOrgWith(sql)
    await setInboxOrgSetting(sql, org.id, 'grounding_source_urls', ['https://example.com/help'])
    const res = await $fetch<{ synced: string[], failed: unknown[], pruned: number }>(
      '/api/inbox/grounding/refresh',
      { method: 'POST', body: {}, ...opts }
    )
    expect(res.synced).toContain('https://example.com/help')
    expect(res.failed).toHaveLength(0)
  })
})
