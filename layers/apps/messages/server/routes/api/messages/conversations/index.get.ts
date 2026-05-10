// GET /api/messages/conversations
// Returns: { channels: [...], dms: [...] }
// Each entry includes unread_count derived from messages_conversation_reads.

import { sql, type Transaction } from 'kysely'
import type { Database } from '~/server/database/schema'
import { defineTenantHandler } from '#tenant/server'

interface ChannelRow {
  id: string
  name: string | null
  description: string | null
  subscribed: boolean
  unread_count: number
}

interface DmRow {
  id: string
  unread_count: number
  members: Array<{ id: string, display_name: string, avatar: string }>
}

export default defineTenantHandler({ appId: 'messages' }, async (tx, ctx) => {
  // Channels: all non-archived 'channel' rows in this org.
  const channelRows = await tx
    .selectFrom('messages_conversations as c')
    .leftJoin('messages_channel_subscriptions as sub', join =>
      join.onRef('sub.channel_id', '=', 'c.id').on('sub.user_id', '=', ctx.userId))
    .leftJoin('messages_conversation_reads as r', join =>
      join.onRef('r.conversation_id', '=', 'c.id').on('r.user_id', '=', ctx.userId))
    .select([
      'c.id',
      'c.name',
      'c.description',
      eb => eb('sub.user_id', 'is not', null).as('subscribed'),
      eb => eb.fn.coalesce('r.last_read_at', sql<Date>`'epoch'::timestamptz`).as('last_read_at')
    ])
    .where('c.kind', '=', 'channel')
    .where('c.archived_at', 'is', null)
    .orderBy('c.name', 'asc')
    .execute()

  const channels: ChannelRow[] = []
  for (const row of channelRows) {
    const unread = await countUnread(tx, row.id, row.last_read_at as Date, ctx.userId)
    channels.push({
      id: row.id,
      name: row.name,
      description: row.description,
      subscribed: !!row.subscribed,
      unread_count: unread
    })
  }

  // DMs: conversations the user is a member of.
  const dmRows = await tx
    .selectFrom('messages_conversations as c')
    .innerJoin('messages_conversation_members as m', join =>
      join.onRef('m.conversation_id', '=', 'c.id').on('m.user_id', '=', ctx.userId))
    .leftJoin('messages_conversation_reads as r', join =>
      join.onRef('r.conversation_id', '=', 'c.id').on('r.user_id', '=', ctx.userId))
    .select([
      'c.id',
      eb => eb.fn.coalesce('r.last_read_at', sql<Date>`'epoch'::timestamptz`).as('last_read_at')
    ])
    .where('c.kind', '=', 'dm')
    .where('c.archived_at', 'is', null)
    .execute()

  const dms: DmRow[] = []
  for (const row of dmRows) {
    const members = await tx
      .selectFrom('messages_conversation_members as m')
      .innerJoin('users', 'users.id', 'm.user_id')
      .select(['users.id', 'users.display_name', 'users.avatar'])
      .where('m.conversation_id', '=', row.id)
      .execute()
    const unread = await countUnread(tx, row.id, row.last_read_at as Date, ctx.userId)
    dms.push({
      id: row.id,
      unread_count: unread,
      members: members.map(u => ({ id: u.id, display_name: u.display_name, avatar: u.avatar }))
    })
  }

  return { channels, dms }
})

async function countUnread(
  tx: Transaction<Database>,
  conversationId: string,
  lastReadAt: Date,
  viewerId: string
): Promise<number> {
  const row = await tx
    .selectFrom('messages_items')
    .select(eb => eb.fn.countAll<string>().as('c'))
    .where('conversation_id', '=', conversationId)
    .where('created_at', '>', lastReadAt)
    .where('deleted_at', 'is', null)
    .where('author_id', '!=', viewerId)
    .executeTakeFirst()
  return Number(row?.c ?? 0)
}
