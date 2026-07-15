// GET /api/inbox/records/:recordId/conversations
// Every inbox thread across all of a CRM record's linked email addresses —
// channel-strict threading forks a separate thread per address, so a contact
// with two emails can have parallel histories. Includes spam (the panel is the
// full record history) and returns the record's email channels so the panel
// can start a brand-new conversation to a locked recipient. inbox.access-gated;
// RLS scopes every row to the org.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const recordId = getRouterParam(event, 'recordId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    const channels = await tx
      .selectFrom('crm_contact_channels')
      .innerJoin('crm_channels', 'crm_channels.id', 'crm_contact_channels.channel_id')
      .select([
        'crm_channels.id as channel_id',
        'crm_channels.value as value',
        'crm_contact_channels.is_primary as is_primary'
      ])
      .where('crm_contact_channels.record_id', '=', recordId)
      .where('crm_channels.channel_type', '=', 'email')
      .orderBy('crm_contact_channels.is_primary', 'desc')
      .orderBy('crm_contact_channels.sort_order', 'asc')
      .execute()

    const channelIds = [...new Set(channels.map(c => c.channel_id))]
    const items = channelIds.length
      ? await inboxListConversations(tx, { channelId: channelIds, limit: 100 })
      : []

    return {
      channels: channels.map(c => ({ channelId: c.channel_id, value: c.value, isPrimary: c.is_primary })),
      items: items.map(c => ({
        id: c.id,
        subject: c.subject,
        status: c.status,
        needsReview: c.needs_review,
        source: c.source,
        counterpartyName: c.counterparty_name,
        assigneeName: c.assignee_name,
        tags: c.tags,
        channelValue: c.channel_value,
        messageCount: c.message_count,
        snippet: c.last_message_snippet,
        lastMessageAt: c.last_message_at,
        lastMessageDirection: c.last_message_direction,
        createdAt: c.created_at
      }))
    }
  })
})
