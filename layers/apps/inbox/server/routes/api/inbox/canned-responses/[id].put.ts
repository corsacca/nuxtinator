// PUT /api/inbox/canned-responses/:id { title?, bodyHtml? } → the updated
// snippet. Partial: an omitted field is left untouched; a title-only edit still
// bumps updated_at. Existence is checked before the body is parsed so a stale
// id 404s regardless of payload.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'

const Body = z.object({
  // trim-then-validate: a whitespace-only title must not blank a snippet.
  title: z.string().trim().min(1).max(200).optional(),
  bodyHtml: z.string().max(100_000).optional()
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    const existing = await inboxGetCanned(tx, id)
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Canned response not found' })
    }
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const row = await inboxUpdateCanned(tx, id, {
      title: parsed.data.title?.trim(),
      bodyHtml: parsed.data.bodyHtml
    })
    // Audit the edit of a shared asset. Title transitions carry from/to;
    // bodies are large HTML, logged as a change flag only.
    await logEvent({
      eventType: 'inbox_canned_updated',
      userId: ctx.userId,
      metadata: {
        message: 'Canned response updated',
        cannedId: id,
        title: row!.title,
        ...(row!.title !== existing.title ? { titleFrom: existing.title } : {}),
        bodyChanged: parsed.data.bodyHtml !== undefined && parsed.data.bodyHtml !== existing.body_html
      }
    }, tx)
    return {
      id: row!.id,
      title: row!.title,
      bodyHtml: row!.body_html,
      createdBy: row!.created_by,
      createdAt: row!.created_at,
      updatedAt: row!.updated_at
    }
  })
})
