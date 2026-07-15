// Outbound From naming: shared-address sends and courtesy mail carry the
// org's brand From name (per-org setting), never the agent's personal name —
// the shared identity exists to not expose the individual. Personal-alias
// sends carry the agent's own display name.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupInboxTestData,
  createInboxOrgWith,
  setInboxOrgSetting,
  postInbound,
  waitForMailTo
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function uniqueSender(tag: string) {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

async function fromHeader(mailId: string): Promise<string> {
  const base = process.env.TEST_MAILHOG_URL || 'http://localhost:8025'
  const res = await fetch(`${base}/api/v1/message/${mailId}/headers`)
  const headers = await res.json() as Record<string, string[]>
  return headers.From?.[0] ?? headers.from?.[0] ?? ''
}

describe('brand From name', () => {
  it('shared sends carry the brand name, personal sends the agent name', async () => {
    const { org, opts, user, domain } = await createInboxOrgWith(sql)
    await setInboxOrgSetting(sql, org.id, 'auto_ack_enabled', false)
    await setInboxOrgSetting(sql, org.id, 'brand_from_name', 'Acme Support')

    // Shared-address send.
    const shared = uniqueSender('shared')
    const a = await postInbound({ recipient: `hello@${domain}`, from: `S <${shared}>` })
    await $fetch(`/api/inbox/conversations/${a.body.conversation_id}/messages`, {
      method: 'POST', body: { body: '<p>from the team</p>' }, ...opts
    })
    const sharedMail = await waitForMailTo(shared, 15_000)
    const sharedFrom = await fromHeader(sharedMail.id)
    expect(sharedFrom).toContain('Acme Support')
    expect(sharedFrom).toContain(`contact@${domain}`)
    expect(sharedFrom).not.toContain(user.display_name)

    // Personal-alias send.
    await $fetch(`/api/inbox/identities/${user.id}`, { method: 'PUT', body: { alias: 'jane' }, ...opts })
    const personal = uniqueSender('personal')
    const b = await postInbound({ recipient: `hello@${domain}`, from: `P <${personal}>` })
    await $fetch(`/api/inbox/conversations/${b.body.conversation_id}/messages`, {
      method: 'POST', body: { body: '<p>from me</p>', fromIdentity: 'personal' }, ...opts
    })
    const personalMail = await waitForMailTo(personal, 15_000)
    const personalFrom = await fromHeader(personalMail.id)
    expect(personalFrom).toContain(user.display_name)
    expect(personalFrom).toContain(`jane@${domain}`)
    expect(personalFrom).not.toContain('Acme Support')
  })

  it('courtesy auto-ack sends from the brand name', async () => {
    const { org, domain } = await createInboxOrgWith(sql)
    await setInboxOrgSetting(sql, org.id, 'brand_from_name', 'Acme Support')
    const sender = uniqueSender('ack')
    await postInbound({ recipient: `hello@${domain}`, from: `A <${sender}>` })
    const ack = await waitForMailTo(sender, 15_000)
    expect(await fromHeader(ack.id)).toContain('Acme Support')
  })
})
