// GET /api/inbox/assignees
// Users assignable to conversations = users who can open the inbox. Keeps
// the picker honest (no assigning to someone who can't see the app) without
// exposing the full user directory.

import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    const ids = await inboxUsersWithAccess(tx, ctx.orgId)
    if (ids.length === 0) return { users: [] }
    const rows = await tx
      .selectFrom('users')
      .select(['id', 'display_name', 'avatar'])
      .where('id', 'in', ids)
      .orderBy('display_name', 'asc')
      .execute()
    return { users: rows.map(r => ({ id: r.id, displayName: r.display_name, avatar: r.avatar })) }
  })
})
