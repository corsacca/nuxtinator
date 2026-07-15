// Staff-started conversations (POST /api/inbox/conversations): the toEmail
// variant claims-or-reuses the recipient's channel (dedupe), the conversation
// lands assigned + pending with a queued first message, and the guards hold —
// zod 400s, unknown channel 404, and inbox.send 403.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

describe('compose (staff-started conversation)', () => {
  it('starts a conversation to a new address and dedupes the channel on a second compose', async () => {
    const { user, opts } = await createInboxOrgWith(sql)
    const toEmail = `test-inbox-target-${randomUUID().slice(0, 8)}@recipient.example`

    const first = await $fetch<{ id: string, messageId: string }>('/api/inbox/conversations', {
      method: 'POST',
      body: { toEmail, subject: 'Hello there', body: '<p>Reaching out</p>' },
      ...opts
    })
    expect(first.id).toBeTruthy()

    const [conv] = await sql`
      SELECT status, assigned_user_id, source, channel_id FROM inbox_conversations WHERE id = ${first.id}
    `
    expect(conv!.status).toBe('pending')
    expect(conv!.assigned_user_id).toBe(user.id)
    expect(conv!.source).toBe('staff')
    const [msg] = await sql`SELECT status, direction, to_email FROM inbox_messages WHERE id = ${first.messageId}`
    expect(msg!.direction).toBe('outbound')
    expect(msg!.to_email).toBe(toEmail)

    // Same address again → the channel identity is reused, not duplicated.
    const second = await $fetch<{ id: string }>('/api/inbox/conversations', {
      method: 'POST',
      body: { toEmail, subject: 'Following up', body: '<p>Again</p>' },
      ...opts
    })
    const [conv2] = await sql`SELECT channel_id FROM inbox_conversations WHERE id = ${second.id}`
    expect(conv2!.channel_id).toBe(conv!.channel_id)
    const channels = await sql`SELECT id FROM crm_channels WHERE value = ${toEmail}`
    expect(channels.length).toBe(1)
  })

  it('rejects invalid bodies with 400 and an unknown channel with 404', async () => {
    const { opts } = await createInboxOrgWith(sql)
    // Neither toEmail nor channelId.
    await expect(
      $fetch('/api/inbox/conversations', { method: 'POST', body: { subject: 's', body: 'b' }, ...opts })
    ).rejects.toMatchObject({ statusCode: 400 })
    // Missing subject.
    await expect(
      $fetch('/api/inbox/conversations', { method: 'POST', body: { toEmail: 'a@b.example', body: 'b' }, ...opts })
    ).rejects.toMatchObject({ statusCode: 400 })
    // Malformed email.
    await expect(
      $fetch('/api/inbox/conversations', { method: 'POST', body: { toEmail: 'nope', subject: 's', body: 'b' }, ...opts })
    ).rejects.toMatchObject({ statusCode: 400 })
    // Unknown channel id.
    await expect(
      $fetch('/api/inbox/conversations', { method: 'POST', body: { channelId: randomUUID(), subject: 's', body: 'b' }, ...opts })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('sends a new conversation from the personal alias, with signature, when chosen', async () => {
    const { opts, user, domain } = await createInboxOrgWith(sql)
    await $fetch(`/api/inbox/identities/${user.id}`, {
      method: 'PUT', body: { alias: 'jane', signature: '<p>Best, Jane</p>' }, ...opts
    })
    const toEmail = `test-inbox-personal-${randomUUID().slice(0, 8)}@recipient.example`
    const res = await $fetch<{ messageId: string }>('/api/inbox/conversations', {
      method: 'POST',
      body: { toEmail, subject: 'Intro', body: '<p>Hello!</p>', fromIdentity: 'personal' },
      ...opts
    })
    const [msg] = await sql`SELECT from_email, body_html FROM inbox_messages WHERE id = ${res.messageId}`
    expect(msg!.from_email).toBe(`jane@${domain}`)
    expect(msg!.body_html).toContain('Best, Jane')
  })

  it('requires inbox.send', async () => {
    const member = await createInboxOrgWith(sql, ['member'])
    await expect(
      $fetch('/api/inbox/conversations', {
        method: 'POST',
        body: { toEmail: 'a@b.example', subject: 's', body: 'b' },
        ...member.opts
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
