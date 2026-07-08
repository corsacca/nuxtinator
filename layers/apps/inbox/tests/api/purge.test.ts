// GDPR conversation purge: an admin hard-deletes a thread (and its S3 objects);
// a non-admin is refused.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { randomUUID } from 'node:crypto'
import { getHostAdminDb, cleanupInboxTestData, createInboxOrgWith, postInbound } from '../helpers'

const sql = getHostAdminDb()
afterEach(async () => { await cleanupInboxTestData(sql) })

function sender(): string {
  return `test-inbox-${randomUUID().slice(0, 8)}@sender.example`
}

describe('conversation purge', () => {
  it('hard-deletes a conversation for an admin', async () => {
    const { opts, domain } = await createInboxOrgWith(sql)
    const res = await postInbound({ recipient: `hello@${domain}`, from: `P <${sender()}>` })
    const convId = res.body.conversation_id as string

    const purge = await $fetch<{ ok: boolean }>(`/api/inbox/conversations/${convId}/purge`, { method: 'POST', ...opts })
    expect(purge.ok).toBe(true)
    await expect($fetch(`/api/inbox/conversations/${convId}`, opts)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('forbids a non-admin from purging', async () => {
    const { opts, domain } = await createInboxOrgWith(sql, ['inbox_agent'])
    const res = await postInbound({ recipient: `hello@${domain}`, from: `P <${sender()}>` })
    const convId = res.body.conversation_id as string
    await expect(
      $fetch(`/api/inbox/conversations/${convId}/purge`, { method: 'POST', ...opts })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
