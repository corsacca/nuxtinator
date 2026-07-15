// Outbound attachments: upload bound to a draft, appearance in the detail
// payload, removal, and the guards (blocked types, cross-conversation, and
// draft-only scoping).
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith, postInbound } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function sender(tag = 'att') {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

function fileForm(draftId: string, name: string, type = 'application/pdf') {
  const fd = new FormData()
  fd.append('draftId', draftId)
  fd.append('file', new Blob([Buffer.from(`bytes for ${name}`)], { type }), name)
  return fd
}

async function makeDraft(id: string, opts: object) {
  const d = await $fetch<{ id: string }>(`/api/inbox/conversations/${id}/messages`, {
    method: 'POST', body: { saveDraft: true, body: '<p>with a file</p>' }, ...opts
  })
  return d.id
}

interface Detail {
  drafts: Array<{ id: string, attachments: Array<{ id: string, filename: string | null }> }>
}

describe('outbound attachments', () => {
  it('uploads a file onto a draft and surfaces it in the detail payload', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const res = await postInbound({ recipient: `hello@${domain}`, from: `J <${sender()}>` })
    const id = res.body.conversation_id as string
    const draftId = await makeDraft(id, opts)

    const up = await $fetch<{ attachment: { id: string, filename: string } }>(
      `/api/inbox/conversations/${id}/attachments`, { method: 'POST', body: fileForm(draftId, 'notes.pdf'), ...opts }
    )
    expect(up.attachment.filename).toBe('notes.pdf')

    const detail = await $fetch<Detail>(`/api/inbox/conversations/${id}`, opts)
    const draft = detail.drafts.find(d => d.id === draftId)!
    expect(draft.attachments.map(a => a.filename)).toContain('notes.pdf')

    // Remove it → gone from the payload.
    const del = await $fetch<{ success: boolean }>(`/api/inbox/conversations/${id}/attachments/${up.attachment.id}`, { method: 'DELETE', ...opts })
    expect(del.success).toBe(true)
    const after = await $fetch<Detail>(`/api/inbox/conversations/${id}`, opts)
    expect(after.drafts.find(d => d.id === draftId)?.attachments ?? []).toHaveLength(0)
  })

  it('rejects malformed ids with a clean 400 (never a Postgres cast 500)', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const res = await postInbound({ recipient: `hello@${domain}`, from: `M <${sender('malformed')}>` })
    const id = res.body.conversation_id as string

    await expect(
      $fetch(`/api/inbox/conversations/${id}/attachments`, { method: 'POST', body: fileForm('not-a-uuid', 'notes.pdf'), ...opts })
    ).rejects.toMatchObject({ statusCode: 400 })

    await expect(
      $fetch(`/api/inbox/conversations/${id}/attachments/not-a-uuid`, { method: 'DELETE', ...opts })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects blocked types and a draft on another conversation', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const a = await postInbound({ recipient: `hello@${domain}`, from: `A <${sender('a')}>` })
    const b = await postInbound({ recipient: `hello@${domain}`, from: `B <${sender('b')}>` })
    const idA = a.body.conversation_id as string
    const draftA = await makeDraft(idA, opts)

    // Executable extension is refused.
    await expect(
      $fetch(`/api/inbox/conversations/${idA}/attachments`, { method: 'POST', body: fileForm(draftA, 'evil.exe'), ...opts })
    ).rejects.toMatchObject({ statusCode: 400 })

    // A draft that belongs to conversation A can't be targeted via B's URL.
    await expect(
      $fetch(`/api/inbox/conversations/${b.body.conversation_id}/attachments`, { method: 'POST', body: fileForm(draftA, 'ok.pdf'), ...opts })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('will not remove an attachment once its draft has been sent', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const res = await postInbound({ recipient: `hello@${domain}`, from: `J <${sender('sent')}>` })
    const id = res.body.conversation_id as string
    const draftId = await makeDraft(id, opts)
    const up = await $fetch<{ attachment: { id: string } }>(
      `/api/inbox/conversations/${id}/attachments`, { method: 'POST', body: fileForm(draftId, 'keep.pdf'), ...opts }
    )

    // Promote the draft → the attachment now belongs to a sent message.
    await $fetch(`/api/inbox/conversations/${id}/messages`, { method: 'POST', body: { draftId }, ...opts })

    await expect(
      $fetch(`/api/inbox/conversations/${id}/attachments/${up.attachment.id}`, { method: 'DELETE', ...opts })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
