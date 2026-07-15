// POST /api/inbox/canned-responses { title, bodyHtml? } → the created snippet.
// inbox.send-gated (composing/replying authority owns snippet management).
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'

const Body = z.object({
  // trim-then-validate: a whitespace-only title must not create an
  // empty-titled snippet.
  title: z.string().trim().min(1).max(200),
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
    // Snippets are shared assets — management actions leave an audit trail.
    await logEvent({
      eventType: 'inbox_canned_created',
      userId: ctx.userId,
      metadata: { message: 'Canned response created', cannedId: row.id, title: row.title }
    }, tx)
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
