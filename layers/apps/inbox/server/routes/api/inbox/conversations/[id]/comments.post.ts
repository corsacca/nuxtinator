// POST /api/inbox/conversations/:id/comments { body }
// Adds an internal note. The body is rich HTML, sanitized on write with the
// note allowlist (formatting + inline @mention spans, no images/scripts).
// Mention recipients are extracted server-side from the SANITIZED markup —
// there is no client-supplied id list to trust.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  body: z.string().min(1).max(20_000)
})

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
    const html = inboxSanitizeNoteHtml(parsed.data.body)
    // Empty-doc guard: an editor's "<p></p>" (or markup that sanitized away)
    // is not a note. A mention alone counts as content.
    if (!html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Note is empty' })
    }
    const comment = await inboxAddComment(tx, id, ctx.userId, html)
    const requested = inboxExtractMentionIds(html).filter(uid => uid !== ctx.userId)
    if (requested.length) {
      // Extracted ids are still browser-authored markup: only teammates who
      // can open this inbox are notifiable. Anything else (cross-org ids,
      // users without inbox access, nonexistent uuids) drops silently — which
      // also keeps a bad id from FK-failing the transaction and losing the
      // note.
      const allowed = new Set(await inboxUsersWithAccess(tx, ctx.orgId))
      const mentions = requested.filter(uid => allowed.has(uid))
      if (mentions.length) {
        await inboxNotifyMention(tx, {
          conversationId: id,
          mentionedUserIds: mentions,
          actorName: comment.authorName,
          subject: conversation.subject,
          noteExcerpt: inboxHtmlToText(html)
        })
      }
    }
    return comment
  })
})
