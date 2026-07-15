// Suppression admin: the org-wide active list, reason upgrade on a repeat event
// (bounce → complaint), and the admin un-suppress (recovery) path.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith, postInbound, postDeliveryEvent } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function uniqueSender(tag: string): string {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

async function triggerBounce(org: { id: string }, domain: string, sender: string): Promise<void> {
  await postInbound({ recipient: `hello@${domain}`, from: `X <${sender}>` })
  await postDeliveryEvent({
    event: 'failed', severity: 'permanent', recipient: sender,
    'delivery-status': { message: '550 mailbox gone' },
    'user-variables': { 'inbox-org': org.id }
  })
}

describe('suppression admin', () => {
  it('lists active suppressions with the address', async () => {
    const { org, domain, opts } = await createInboxOrgWith(sql)
    const sender = uniqueSender('bounce')
    await triggerBounce(org, domain, sender)

    const list = await $fetch<{ items: Array<{ value: string, reason: string }> }>('/api/inbox/suppressions', opts)
    const row = list.items.find(i => i.value === sender)
    expect(row).toBeTruthy()
    expect(row!.reason).toBe('hard_bounce')
  })

  it('upgrades a bounce to a complaint on a later complaint event', async () => {
    const { org, domain, opts } = await createInboxOrgWith(sql)
    const sender = uniqueSender('upgrade')
    await triggerBounce(org, domain, sender)
    await postDeliveryEvent({ event: 'complained', recipient: sender, 'user-variables': { 'inbox-org': org.id } })

    const list = await $fetch<{ items: Array<{ value: string, reason: string }> }>('/api/inbox/suppressions', opts)
    expect(list.items.find(i => i.value === sender)!.reason).toBe('complaint')
  })

  it('lets an admin clear a bounce suppression', async () => {
    const { org, domain, opts } = await createInboxOrgWith(sql)
    const sender = uniqueSender('clear')
    await triggerBounce(org, domain, sender)

    const list = await $fetch<{ items: Array<{ channelId: string, value: string }> }>('/api/inbox/suppressions', opts)
    const channelId = list.items.find(i => i.value === sender)!.channelId
    await $fetch(`/api/inbox/suppressions/${channelId}/clear`, { method: 'POST', ...opts })

    const after = await $fetch<{ items: Array<{ value: string }> }>('/api/inbox/suppressions', opts)
    expect(after.items.find(i => i.value === sender)).toBeUndefined()
  })
})
