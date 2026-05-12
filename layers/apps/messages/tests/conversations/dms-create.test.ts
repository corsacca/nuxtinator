// POST /api/messages/conversations/dms
// 1:1 DMs are find-or-create (deduped via sorted-pair partial unique index).
// Group DMs (3+ members) always create fresh.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupMessagesTestData,
  createMessagesOrgWith,
  addMessagesMember,
  withOrgHeader
} from '../helpers'

describe('POST /api/messages/conversations/dms', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('creates a 1:1 DM with both members; second call returns the same id', async () => {
    const { org, user: a, auth } = await createMessagesOrgWith(sql, ['admin'])
    const b = await addMessagesMember(sql, org.id, ['member'])

    const first = await $fetch<{ id: string, kind: string, members: Array<{ id: string }> }>(
      '/api/messages/conversations/dms',
      { method: 'POST', body: { userIds: [b.user.id] }, ...withOrgHeader(auth, org.slug) }
    )
    expect(first.kind).toBe('dm')
    expect(first.members.map(m => m.id).sort()).toEqual([a.id, b.user.id].sort())

    // Second call must find-or-create — same id.
    const second = await $fetch<{ id: string }>(
      '/api/messages/conversations/dms',
      { method: 'POST', body: { userIds: [b.user.id] }, ...withOrgHeader(auth, org.slug) }
    )
    expect(second.id).toBe(first.id)

    const rows = await sql<{ kind: string, dm_pair_lo: string, dm_pair_hi: string }[]>`
      SELECT kind, dm_pair_lo, dm_pair_hi FROM messages_conversations WHERE id = ${first.id}
    `
    expect(rows[0]!.kind).toBe('dm')
    // dm_pair_lo / dm_pair_hi are the sorted pair
    expect([rows[0]!.dm_pair_lo, rows[0]!.dm_pair_hi].sort()).toEqual([a.id, b.user.id].sort())
  })

  it('creates a group DM (3 members) always fresh', async () => {
    const { org, user: a, auth } = await createMessagesOrgWith(sql, ['admin'])
    const b = await addMessagesMember(sql, org.id, ['member'])
    const c = await addMessagesMember(sql, org.id, ['member'])

    const first = await $fetch<{ id: string, members: Array<{ id: string }> }>(
      '/api/messages/conversations/dms',
      { method: 'POST', body: { userIds: [b.user.id, c.user.id] }, ...withOrgHeader(auth, org.slug) }
    )
    expect(first.members.length).toBe(3)
    expect(first.members.map(m => m.id).sort()).toEqual([a.id, b.user.id, c.user.id].sort())

    // Group DMs aren't deduped — second call creates a fresh row.
    const second = await $fetch<{ id: string }>(
      '/api/messages/conversations/dms',
      { method: 'POST', body: { userIds: [b.user.id, c.user.id] }, ...withOrgHeader(auth, org.slug) }
    )
    expect(second.id).not.toBe(first.id)

    const rows = await sql<{ dm_pair_lo: string | null }[]>`
      SELECT dm_pair_lo FROM messages_conversations WHERE id = ${first.id}
    `
    // Group DMs have null dm_pair (so the partial unique index doesn't apply).
    expect(rows[0]!.dm_pair_lo).toBeNull()
  })

  it('returns 400 when the userIds list excludes self and is empty', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/conversations/dms', {
      method: 'POST',
      body: { userIds: [user.id] }, // self only — deduped to empty
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('rejects userIds that are not org members with 400', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const stranger = await createMessagesOrgWith(sql, ['admin']) // member of a different org
    const err = await $fetch('/api/messages/conversations/dms', {
      method: 'POST',
      body: { userIds: [stranger.user.id] },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })

  it('rejects malformed userIds with 400', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/conversations/dms', {
      method: 'POST',
      body: { userIds: ['not-a-uuid'] },
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})
