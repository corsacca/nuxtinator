// DELETE /api/messages/reactions
// Body: { target_kind, target_id, emoji }
// Removes the caller's reaction. No-op if it didn't exist.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  target_kind: z.enum(['item', 'comment']),
  target_id: z.string().uuid(),
  emoji: z.string().min(1).max(64)
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    await tx
      .deleteFrom('messages_reactions')
      .where('target_kind', '=', parsed.data.target_kind)
      .where('target_id', '=', parsed.data.target_id)
      .where('user_id', '=', ctx.userId)
      .where('emoji', '=', parsed.data.emoji)
      .execute()

    return { ok: true }
  })
})
