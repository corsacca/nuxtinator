// POST /api/inbox/canned-responses { title, bodyHtml? } → the created snippet.
// inbox.send-gated (composing/replying authority owns snippet management).
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  title: z.string().min(1).max(200),
  bodyHtml: z.string().max(100_000).optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Title is required' })
    }
    const row = await inboxCreateCanned(tx, {
      title: parsed.data.title.trim(),
      bodyHtml: parsed.data.bodyHtml ?? '',
      createdBy: ctx.userId
    })
    return {
      id: row.id,
      title: row.title,
      bodyHtml: row.body_html,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  })
})
