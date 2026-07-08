// Public contact-form intake: API-key auth (identifies the org), a submission
// becoming a source='contact_form' conversation with a first inbound message
// and a first-line subject fallback, and the 401/400 rejections.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith, setInboxOrgSetting } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

describe('contact form', () => {
  it('creates a source=contact_form conversation from a submission', async () => {
    const { org, opts } = await createInboxOrgWith(sql)
    const apiKey = `test-inbox-key-${randomUUID()}`
    await setInboxOrgSetting(sql, org.id, 'contact_form_api_key', apiKey)

    const res = await $fetch<{ status: string, conversationId: string }>('/api/inbox/contact', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: { email: 'visitor@example.com', name: 'Visitor', message: 'Hello there\nI have a question' }
    })
    expect(res.status).toBe('received')

    const detail = await $fetch<{
      conversation: { source: string, subject: string | null }
      messages: Array<{ direction: string }>
    }>(`/api/inbox/conversations/${res.conversationId}`, opts)
    expect(detail.conversation.source).toBe('contact_form')
    expect(detail.conversation.subject).toBe('Hello there')
    expect(detail.messages.some(m => m.direction === 'inbound')).toBe(true)
  })

  it('rejects a missing or wrong API key with 401', async () => {
    const { org } = await createInboxOrgWith(sql)
    await setInboxOrgSetting(sql, org.id, 'contact_form_api_key', `test-inbox-key-${randomUUID()}`)
    await expect(
      $fetch('/api/inbox/contact', { method: 'POST', headers: { 'x-api-key': 'wrong' }, body: { email: 'a@b.com', message: 'hi' } })
    ).rejects.toMatchObject({ statusCode: 401 })
    await expect(
      $fetch('/api/inbox/contact', { method: 'POST', body: { email: 'a@b.com', message: 'hi' } })
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects a malformed email with 400', async () => {
    const { org } = await createInboxOrgWith(sql)
    const apiKey = `test-inbox-key-${randomUUID()}`
    await setInboxOrgSetting(sql, org.id, 'contact_form_api_key', apiKey)
    await expect(
      $fetch('/api/inbox/contact', { method: 'POST', headers: { 'x-api-key': apiKey }, body: { email: 'nope', message: 'hi' } })
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
