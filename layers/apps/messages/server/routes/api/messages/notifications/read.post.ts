// POST /api/messages/notifications/read
// Body: { ids?: string[], all?: boolean }
// Marks notifications as read for the caller.

import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgContext } from '#tenant/server'

const Body = z.object({
  ids: z.array(z.string().uuid()).optional(),
  all: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'messages' }, async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success || (!parsed.data.ids && !parsed.data.all)) {
      throw createError({ statusCode: 400, statusMessage: 'Provide ids or all=true.' })
    }

    let qb = tx
      .updateTable('messages_notifications')
      .set({ read_at: sql<Date>`now()` })
      .where('user_id', '=', ctx.userId)
      .where('read_at', 'is', null)

    if (parsed.data.ids && parsed.data.ids.length > 0) {
      qb = qb.where('id', 'in', parsed.data.ids)
    }

    await qb.execute()

    return { ok: true }
  })
})
