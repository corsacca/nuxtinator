// Staff-notification targeting: an unassigned new inbound raises a bell-only
// broadcast to everyone with inbox access; once a conversation has an
// assignee, a contact reply notifies only them with an immediate email; a
// vacation auto-reply notifies nobody; a held (non-vacation) intruder message
// raises the held notice.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import {
  getHostAdminDb,
  cleanupInboxTestData,
  createInboxOrgWith,
  setInboxOrgSetting,
  postInbound
} from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function uniqueSender(tag: string) {
  return `test-inbox-${tag}-${randomUUID().slice(0, 8)}@sender.example`
}

async function notificationRows(convId: string) {
  return await sql`
    SELECT user_id, title, email_mode FROM notifications WHERE link = ${`/inbox/${convId}`}
  `
}

describe('staff notification targeting', () => {
  it('broadcasts bell-only to inbox users for an unassigned new message', async () => {
    const { user, domain } = await createInboxOrgWith(sql)
    const res = await postInbound({ recipient: `hello@${domain}`, from: `N <${uniqueSender('bcast')}>` })
    const rows = await notificationRows(res.body.conversation_id as string)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => (r.title as string).startsWith('New message from'))).toBe(true)
    expect(rows.every(r => r.email_mode === 'none')).toBe(true)
    expect(rows.map(r => r.user_id)).toContain(user.id)
  })

  it('sends the assignee an immediate email on a contact reply', async () => {
    const { org, user, opts, domain } = await createInboxOrgWith(sql)
    await setInboxOrgSetting(sql, org.id, 'auto_ack_enabled', false)
    const sender = uniqueSender('assigned')
    const first = await postInbound({ recipient: `hello@${domain}`, from: `R <${sender}>` })
    const convId = first.body.conversation_id as string

    // Staff reply auto-assigns the replier.
    await $fetch(`/api/inbox/conversations/${convId}/messages`, {
      method: 'POST', body: { body: '<p>on it</p>' }, ...opts
    })
    const [row] = await sql`SELECT reply_token FROM inbox_conversations WHERE id = ${convId}`
    const reply = await postInbound({
      recipient: `contact+${row!.reply_token}@${domain}`,
      from: `R <${sender}>`,
      subject: 'Re: Test subject'
    })
    expect(reply.body.conversation_id).toBe(convId)

    const rows = (await notificationRows(convId)).filter(r => (r.title as string).startsWith('New reply from'))
    expect(rows.length).toBe(1)
    expect(rows[0]!.user_id).toBe(user.id)
    expect(rows[0]!.email_mode).toBe('immediate')
  })

  it('never notifies for a vacation auto-reply; a held intruder message raises the held notice', async () => {
    const { domain } = await createInboxOrgWith(sql)
    const sender = uniqueSender('quiet')
    const first = await postInbound({ recipient: `hello@${domain}`, from: `V <${sender}>` })
    const convId = first.body.conversation_id as string
    const [row] = await sql`SELECT reply_token FROM inbox_conversations WHERE id = ${convId}`
    const tokenAddr = `contact+${row!.reply_token}@${domain}`

    const before = (await notificationRows(convId)).length
    await postInbound({
      recipient: tokenAddr,
      from: `V <${sender}>`,
      headers: [['Auto-Submitted', 'auto-replied']]
    })
    expect((await notificationRows(convId)).length).toBe(before)

    const held = await postInbound({ recipient: tokenAddr, from: `M <${uniqueSender('mal')}>` })
    expect(held.body.status).toBe('held')
    const heldRows = (await notificationRows(convId)).filter(r => (r.title as string).startsWith('Held message from'))
    expect(heldRows.length).toBeGreaterThan(0)
  })
})
