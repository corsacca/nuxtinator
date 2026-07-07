// Spam blocklist — an inbound routing verdict keyed by the claimed channel
// row. Deliberately separate from crm_channel_suppressions: suppression is
// outbound deliverability truth (bounces/complaints), blocking is a staff
// decision about inbound mail. The unique(channel_id) needs no org rescope —
// the FK target row is itself org-scoped.
import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

type Tx = Transaction<Database>

export async function inboxIsChannelBlocked(tx: Tx, channelId: string): Promise<boolean> {
  const row = await tx
    .selectFrom('inbox_blocked_senders')
    .select('id')
    .where('channel_id', '=', channelId)
    .executeTakeFirst()
  return !!row
}

export async function inboxBlockChannel(tx: Tx, channelId: string, createdBy: string | null): Promise<void> {
  await tx
    .insertInto('inbox_blocked_senders')
    .values({ channel_id: channelId, created_by: createdBy })
    .onConflict(oc => oc.doNothing())
    .execute()
}

export async function inboxUnblockChannel(tx: Tx, channelId: string): Promise<boolean> {
  const result = await tx
    .deleteFrom('inbox_blocked_senders')
    .where('channel_id', '=', channelId)
    .executeTakeFirst()
  return Number(result.numDeletedRows ?? 0) > 0
}
