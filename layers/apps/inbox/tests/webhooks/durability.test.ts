// Durable-ack contract of the inbound webhook: an artifact-persistence
// failure (injected via the VITEST-only x-test-fail seam) deletes the claim
// row and returns a retryable 503, and the provider's redelivery converges on
// ONE conversation with ONE message. Malformed payloads are rejected 400.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { createHmac, randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupInboxTestData,
  createInboxOrgWith,
  postInbound,
  INBOX_TEST_SIGNING_KEY
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function uniqueSender(tag: string) {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

describe('inbound durability', () => {
  it('503s on a persistence failure and the retry converges on one conversation, one message', async () => {
    const { domain } = await createInboxOrgWith(sql)
    const sender = uniqueSender('retry')
    const messageId = `<test-inbox-durable-${randomUUID()}@sender.example>`

    const failed = await postInbound({
      recipient: `hello@${domain}`,
      from: `D <${sender}>`,
      messageId,
      extraFields: { 'x-test-fail': 'persist' }
    })
    expect(failed.status).toBe(503)

    // Redelivery (same Message-Id, no injected failure) re-inserts the claim
    // and reuses the already-committed conversation shell.
    const retry = await postInbound({ recipient: `hello@${domain}`, from: `D <${sender}>`, messageId })
    expect(retry.status).toBe(200)
    expect(retry.body.status).toBe('contact')

    const conversations = await sql`
      SELECT c.id FROM inbox_conversations c
      JOIN crm_channels ch ON ch.id = c.channel_id
      WHERE ch.value = ${sender}
    `
    expect(conversations.length).toBe(1)
    const messages = await sql`
      SELECT m.id FROM inbox_messages m WHERE m.conversation_id = ${conversations[0]!.id as string}
    `
    expect(messages.length).toBe(1)
  })

  it('rejects a non-form payload with 400', async () => {
    await createInboxOrgWith(sql)
    await expect(
      $fetch('/api/inbox/webhooks/mailgun/inbound', { method: 'POST', body: { not: 'a form' } })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a signed payload missing recipient/sender with 400', async () => {
    await createInboxOrgWith(sql)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const token = randomUUID().replace(/-/g, '')
    const signature = createHmac('sha256', INBOX_TEST_SIGNING_KEY).update(timestamp + token).digest('hex')
    const form = new FormData()
    form.append('timestamp', timestamp)
    form.append('token', token)
    form.append('signature', signature)
    // recipient / from deliberately absent
    await expect(
      $fetch('/api/inbox/webhooks/mailgun/inbound', { method: 'POST', body: form })
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
