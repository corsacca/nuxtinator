// PATCH /api/inbox/conversations/:id/comments/:commentId { body }
// Edit a note. Own-only unless the caller is an org admin (the moderator bar);
// system notes are never editable. Sets the edited marker. The body runs the
// same note sanitizer as create; edits never re-notify mentions (the ping
// fired when the note was posted).
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({ body: z.string().min(1).max(20_000) })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const commentId = getRouterParam(event, 'commentId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
    }
    const html = inboxSanitizeNoteHtml(parsed.data.body)
    if (!html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Note is empty' })
    }
    return await inboxUpdateComment(tx, commentId, ctx.userId, html, ctx.roles.includes('admin'))
  })
})
