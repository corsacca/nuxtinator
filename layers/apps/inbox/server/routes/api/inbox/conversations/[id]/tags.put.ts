// PUT /api/inbox/conversations/:id/tags { tags: string[] }
// Whole-set replace of the conversation's tags. Unknown/duplicate/non-string
// slugs are dropped silently against the org palette; the response returns the
// sanitized set so the client adopts what actually persisted.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

// Elements are unknown, not string: non-string entries are narrowed away
// below (matching the drop-silently contract) instead of 400-ing the request.
const Body = z.object({ tags: z.array(z.unknown()).max(50) })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    const palette = await inboxListTags(tx)
    const slugs = inboxSanitizeSlugs(palette, parsed.data.tags.filter((t): t is string => typeof t === 'string'))
    await inboxSetConversationTags(tx, id, slugs)
    await inboxLogConversationEvent(tx, id, 'inbox_tags_updated', 'Tags updated', {
      userId: ctx.userId, extra: { tags: slugs }
    })
    return { id, tags: slugs }
  })
})
