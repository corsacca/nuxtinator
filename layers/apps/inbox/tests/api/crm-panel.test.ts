// CRM contact-page integration: the record-conversations panel endpoint (all
// threads across the contact's channels, plus the channels for compose),
// search parity (find a thread by the linked contact's CRM name even when the
// From header only carried initials), and compose-to-contact via channelId.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith, postInbound } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

describe('crm record conversations panel', () => {
  it('lists a contact’s threads + channels and finds them by CRM name', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const sender = `test-inbox-${randomUUID().slice(0, 8)}@sender.example`
    const res = await postInbound({ recipient: `hello@${domain}`, from: `JS <${sender}>`, subject: 'Hi there' })
    const convId = res.body.conversation_id as string

    // Link a CRM contact to the sender's channel (name differs from the From
    // display name "JS").
    const record = await $fetch<{ id: string }>(`/api/inbox/conversations/${convId}/contact`, {
      method: 'POST', body: { name: 'Johnathan Smith' }, ...opts
    })

    const panel = await $fetch<{ items: Array<{ id: string }>, channels: Array<{ value: string, channelId: string }> }>(
      `/api/inbox/records/${record.id}/conversations`, opts
    )
    expect(panel.items.map(i => i.id)).toContain(convId)
    expect(panel.channels.map(c => c.value)).toContain(sender)

    // Search parity: the linked contact's record name finds the thread.
    const search = await $fetch<{ items: Array<{ id: string }> }>('/api/inbox/conversations?q=Johnathan', opts)
    expect(search.items.map(i => i.id)).toContain(convId)
  })

  it('composes a new thread to the contact channel via channelId', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const sender = `test-inbox-${randomUUID().slice(0, 8)}@sender.example`
    const res = await postInbound({ recipient: `hello@${domain}`, from: `A <${sender}>` })
    const convId = res.body.conversation_id as string
    const record = await $fetch<{ id: string }>(`/api/inbox/conversations/${convId}/contact`, {
      method: 'POST', body: { name: 'Compose Target' }, ...opts
    })
    const panel = await $fetch<{ channels: Array<{ channelId: string }> }>(`/api/inbox/records/${record.id}/conversations`, opts)
    const channelId = panel.channels[0]!.channelId

    const created = await $fetch<{ id: string }>('/api/inbox/conversations', {
      method: 'POST', body: { channelId, subject: 'Reaching out', body: '<p>hello</p>' }, ...opts
    })
    const panel2 = await $fetch<{ items: Array<{ id: string }> }>(`/api/inbox/records/${record.id}/conversations`, opts)
    expect(panel2.items.map(i => i.id)).toEqual(expect.arrayContaining([convId, created.id]))
  })
})
