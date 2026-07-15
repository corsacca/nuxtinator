// The delivery-events webhook: bounce → crm suppression, complaint → crm
// suppression, unsubscribe → marketing consent opt-out with a null actor,
// delivered → message state. The sweep-side effect of suppression (a queued
// reply failing instead of sending) is pinned in tests/api/send-sweep.test.ts.
import { describe, it, expect, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupInboxTestData,
  createInboxOrgWith,
  postInbound,
  postDeliveryEvent
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function uniqueSender(tag: string) {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

describe('delivery events webhook', () => {
  it('suppresses the channel on a permanent failure (org-anchored via user variable)', async () => {
    const { org, domain } = await createInboxOrgWith(sql)
    const sender = uniqueSender('bouncer')
    await postInbound({ recipient: `hello@${domain}`, from: `B <${sender}>` })

    const res = await postDeliveryEvent({
      event: 'failed',
      severity: 'permanent',
      recipient: sender,
      reason: 'mailbox full forever',
      'delivery-status': { message: '550 5.1.1 user unknown' },
      'user-variables': { 'inbox-org': org.id }
    })
    expect(res.suppressed).toBe(true)

    const [row] = await sql`
      SELECT s.reason, s.detail, ch.value FROM crm_channel_suppressions s
      JOIN crm_channels ch ON ch.id = s.channel_id
      WHERE ch.value = ${sender}
    `
    expect(row!.reason).toBe('hard_bounce')
    expect(row!.detail).toContain('550')
  })

  it('does not suppress on a transient failure', async () => {
    const { org, domain } = await createInboxOrgWith(sql)
    const sender = uniqueSender('greylist')
    await postInbound({ recipient: `hello@${domain}`, from: `G <${sender}>` })

    await postDeliveryEvent({
      event: 'failed',
      severity: 'temporary',
      recipient: sender,
      'user-variables': { 'inbox-org': org.id }
    })
    const rows = await sql`
      SELECT s.id FROM crm_channel_suppressions s
      JOIN crm_channels ch ON ch.id = s.channel_id WHERE ch.value = ${sender}
    `
    expect(rows.length).toBe(0)
  })

  it('flips marketing consent on unsubscribe with a null actor, without suppressing', async () => {
    const { org, domain } = await createInboxOrgWith(sql)
    const sender = uniqueSender('unsub')
    await postInbound({ recipient: `hello@${domain}`, from: `U <${sender}>` })

    const res = await postDeliveryEvent({
      event: 'unsubscribed',
      recipient: sender,
      'user-variables': { 'inbox-org': org.id }
    })
    expect(res.unsubscribed).toBe(true)

    const [consent] = await sql`
      SELECT cc.purpose, cc.status FROM crm_channel_consents cc
      JOIN crm_channels ch ON ch.id = cc.channel_id WHERE ch.value = ${sender}
    `
    expect(consent!.purpose).toBe('marketing')
    expect(consent!.status).toBe('opt_out')

    const [event] = await sql`
      SELECT e.event, e.actor_user_id, e.source FROM crm_consent_events e
      JOIN crm_channels ch ON ch.id = e.channel_id WHERE ch.value = ${sender}
    `
    expect(event!.event).toBe('revoke')
    expect(event!.actor_user_id).toBeNull()
    expect(event!.source).toBe('mailgun')

    const suppressions = await sql`
      SELECT s.id FROM crm_channel_suppressions s
      JOIN crm_channels ch ON ch.id = s.channel_id WHERE ch.value = ${sender}
    `
    expect(suppressions.length).toBe(0)
  })

  it('ignores events for addresses no scope has claimed', async () => {
    await createInboxOrgWith(sql)
    const res = await postDeliveryEvent({
      event: 'complained',
      recipient: uniqueSender('stranger')
    })
    expect(res.status).toBe('failed')
    expect(res.suppressed).toBeFalsy()
  })
})
