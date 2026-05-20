// POST/DELETE channel subscription endpoints. Idempotent. DMs are no-ops.
import { describe, it, expect, afterEach } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import {
  getHostAdminDb,
  cleanupMessagesTestData,
  createMessagesOrgWith,
  addMessagesMember,
  createTestChannel,
  createTestDm,
  withOrgHeader
} from '../helpers'

describe('POST /api/messages/conversations/:id/subscribe + unsubscribe', () => {
  const sql = getHostAdminDb()

  afterEach(async () => {
    await cleanupMessagesTestData(sql)
  })

  it('subscribe sets subscribed=true; unsubscribe records an explicit subscribed=false opt-out', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })

    await $fetch(`/api/messages/conversations/${ch.id}/subscribe`, {
      method: 'POST',
      ...withOrgHeader(auth, org.slug)
    })
    let rows = await sql<{ subscribed: boolean }[]>`
      SELECT subscribed FROM messages_channel_subscriptions
      WHERE channel_id = ${ch.id} AND user_id = ${user.id}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.subscribed).toBe(true)

    await $fetch(`/api/messages/conversations/${ch.id}/unsubscribe`, {
      method: 'POST',
      ...withOrgHeader(auth, org.slug)
    })
    // Row is kept (now subscribed=false) so auto-subscribe-on-visit won't undo it.
    rows = await sql<{ subscribed: boolean }[]>`
      SELECT subscribed FROM messages_channel_subscriptions
      WHERE channel_id = ${ch.id} AND user_id = ${user.id}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.subscribed).toBe(false)
  })

  it('opening a channel (read) auto-subscribes; a prior unsubscribe is not undone', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })

    // First visit auto-subscribes.
    await $fetch(`/api/messages/conversations/${ch.id}/read`, { method: 'POST', ...withOrgHeader(auth, org.slug) })
    let rows = await sql<{ subscribed: boolean }[]>`
      SELECT subscribed FROM messages_channel_subscriptions
      WHERE channel_id = ${ch.id} AND user_id = ${user.id}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.subscribed).toBe(true)

    // Explicit opt-out, then re-open: opt-out must persist.
    await $fetch(`/api/messages/conversations/${ch.id}/unsubscribe`, { method: 'POST', ...withOrgHeader(auth, org.slug) })
    await $fetch(`/api/messages/conversations/${ch.id}/read`, { method: 'POST', ...withOrgHeader(auth, org.slug) })
    rows = await sql<{ subscribed: boolean }[]>`
      SELECT subscribed FROM messages_channel_subscriptions
      WHERE channel_id = ${ch.id} AND user_id = ${user.id}
    `
    expect(rows.length).toBe(1)
    expect(rows[0]!.subscribed).toBe(false)
  })

  it('subscribe is idempotent (calling twice does not 500)', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const ch = await createTestChannel(sql, { org_id: org.id, created_by: user.id })
    await $fetch(`/api/messages/conversations/${ch.id}/subscribe`, { method: 'POST', ...withOrgHeader(auth, org.slug) })
    await $fetch(`/api/messages/conversations/${ch.id}/subscribe`, { method: 'POST', ...withOrgHeader(auth, org.slug) })

    const rows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM messages_channel_subscriptions
      WHERE channel_id = ${ch.id} AND user_id = ${user.id}
    `
    expect(rows.length).toBe(1)
  })

  it('subscribe to a DM is a no-op (returns subscribed: true without inserting a sub row)', async () => {
    const { org, user, auth } = await createMessagesOrgWith(sql, ['admin'])
    const other = await addMessagesMember(sql, org.id, ['member'])
    const dm = await createTestDm(sql, { org_id: org.id, created_by: user.id, other_user_id: other.user.id })

    const res = await $fetch<{ subscribed: boolean }>(`/api/messages/conversations/${dm.id}/subscribe`, {
      method: 'POST',
      ...withOrgHeader(auth, org.slug)
    })
    expect(res.subscribed).toBe(true)

    const rows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM messages_channel_subscriptions
      WHERE channel_id = ${dm.id}
    `
    expect(rows.length).toBe(0)
  })

  it('subscribing to a DM the caller is not a participant of returns 403', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const x = await addMessagesMember(sql, org.id, ['member'])
    const y = await addMessagesMember(sql, org.id, ['member'])
    const dm = await createTestDm(sql, { org_id: org.id, created_by: x.user.id, other_user_id: y.user.id })

    const err = await $fetch(`/api/messages/conversations/${dm.id}/subscribe`, {
      method: 'POST',
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('returns 404 for an unknown conversation id', async () => {
    const { org, auth } = await createMessagesOrgWith(sql, ['admin'])
    const err = await $fetch('/api/messages/conversations/00000000-0000-0000-0000-000000000000/subscribe', {
      method: 'POST',
      ...withOrgHeader(auth, org.slug)
    }).catch(e => e)
    expect(err.statusCode).toBe(404)
  })
})
