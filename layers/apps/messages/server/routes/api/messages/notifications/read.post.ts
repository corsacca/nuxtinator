// POST /api/messages/notifications/read
// Body: { ids?: string[], all?: boolean }
// Marks notifications as read for the caller.

import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgContext } from '#tenant/server'

// `ids` must contain at least one UUID when present. An empty `ids` array
// from the client must NOT silently fall through to a mark-everything
// update, so we require min(1) and only allow "mark all" via the explicit
// `all: true` flag.
const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).optional(),
  all: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'messages' }, async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success || (!parsed.data.ids && !parsed.data.all)) {
      throw createError({ statusCode: 400, statusMessage: 'Provide ids (non-empty) or all=true.' })
    }

    let qb = tx
      .updateTable('messages_notifications')
      .set({ read_at: sql<Date>`now()` })
      .where('user_id', '=', ctx.userId)
      .where('read_at', 'is', null)

    if (parsed.data.ids) {
      qb = qb.where('id', 'in', parsed.data.ids)
    }

    await qb.execute()

    return { ok: true }
  })
})
