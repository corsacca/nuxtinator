// GET /api/inbox/conversations/:id/activity
// The conversation's audit trail (status/assign/spam/reply/inbound events).
// activity_logs has no RLS, so isolation rides the conversation lookup: we
// resolve the conversation through the RLS-scoped tx first (404 if it's not in
// this org), after which its record_id can only reference this org's rows.

import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }

    const rows = await tx
      .selectFrom('activity_logs as al')
      .leftJoin('users as u', 'u.id', 'al.user_id')
      .select([
        'al.id',
        'al.event_type',
        'al.timestamp',
        'al.user_id',
        'al.metadata',
        'u.display_name as actor_name'
      ])
      .where('al.table_name', '=', INBOX_ACTIVITY)
      .where('al.record_id', '=', id)
      .orderBy('al.timestamp', 'desc')
      .limit(100)
      .execute()

    return {
      items: rows.map(r => ({
        id: r.id,
        eventType: r.event_type,
        message: (r.metadata as { message?: string } | null)?.message ?? null,
        actorId: r.user_id,
        actorName: r.actor_name,
        metadata: r.metadata,
        at: r.timestamp
      }))
    }
  })
})
