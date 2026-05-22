// GET /api/notifications/unread-counts
// Unread totals for the caller: the global count (bell badge) plus a per-app
// breakdown (AppRail tile badges). Active-org scoped via RLS in multi mode.

import { withOrgContext } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, async (tx, ctx) => {
    const rows = await tx
      .selectFrom('notifications')
      .select(eb => ['app_id', eb.fn.countAll<string>().as('c')])
      .where('user_id', '=', ctx.userId)
      .where('read_at', 'is', null)
      .groupBy('app_id')
      .execute()

    const byApp: Record<string, number> = {}
    let total = 0
    for (const r of rows) {
      const n = Number(r.c)
      byApp[r.app_id] = n
      total += n
    }

    return { total, byApp }
  })
})
