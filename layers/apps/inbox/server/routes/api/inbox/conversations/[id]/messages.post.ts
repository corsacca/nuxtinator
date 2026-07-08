// POST /api/inbox/conversations/:id/messages
// Body: { body?, saveDraft?, draftId? }. One endpoint, four intents:
//   saveDraft, no draftId → create a shared draft
//   saveDraft + draftId    → update that draft (body only)
//   send, no draftId       → queue a fresh reply
//   send + draftId         → promote the draft to a queued send (merging the
//                            latest composer edits over the stored body)
// A send auto-assigns an unassigned conversation to the sender, flips it to
// 'pending' (waiting on the contact), and clears the needs-review flag; the
// message row lands 'queued' and the send sweep delivers it. Saving a draft
// does none of that — it only stores text.

import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import type { InboxMessageRow } from '../../../../../utils/inbox-messages'

const Body = z.object({
  body: z.string().max(500_000).optional(),
  saveDraft: z.boolean().optional(),
  draftId: z.string().uuid().optional(),
  // Which From address a send goes out on. 'personal' uses the sender's alias
  // (with a hard fallback to 'contact' when they have none); default 'contact'.
  fromIdentity: z.enum(['personal', 'contact']).optional()
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }
    if (conversation.status === 'spam') {
      throw createError({ statusCode: 400, statusMessage: 'Cannot reply to a spam conversation' })
    }

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const { saveDraft, draftId } = parsed.data
    const rawBody = parsed.data.body ?? ''
    const html = inboxSanitizeEmailHtml(rawBody)
    const text = html.replace(/<[^>]*>/g, '')
    const replySubject = conversation.subject ? `Re: ${conversation.subject.replace(/^Re:\s*/i, '')}` : null

    // --- Save / update a shared draft: store text, no send side effects. ---
    if (saveDraft) {
      if (draftId) {
        const updated = await inboxUpdateDraft(tx, { id: draftId, conversationId: id, bodyHtml: html, bodyText: text })
        if (!updated) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
        return { id: updated.id, status: 'draft' as const }
      }
      const draft = await inboxCreateDraft(tx, {
        conversationId: id,
        senderUserId: ctx.userId,
        bodyHtml: html,
        bodyText: text,
        subject: replySubject
      })
      return { id: draft.id, status: 'draft' as const }
    }

    // --- Send: promote an existing draft, or queue a fresh reply. ---
    let message: InboxMessageRow
    if (draftId) {
      const draft = await inboxGetMessage(tx, draftId)
      if (!draft || draft.conversation_id !== id || draft.status !== 'draft') {
        throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
      }
      // Empty request body keeps the draft's stored body (send-as-is).
      const promoted = await inboxPromoteDraft(tx, {
        id: draftId,
        conversationId: id,
        bodyHtml: rawBody ? html : (draft.body_html ?? ''),
        bodyText: rawBody ? text : (draft.body_text ?? '')
      })
      if (!promoted) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
      message = promoted
    } else {
      if (!rawBody.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'Body is required' })
      }
      message = await inboxCreateMessage(tx, {
        conversationId: conversation.id,
        direction: 'outbound',
        status: 'queued',
        senderUserId: ctx.userId,
        subject: replySubject,
        bodyHtml: html,
        bodyText: text
      })
    }

    // From identity: snapshot the personal From onto the row at queue time
    // (an admin removing the alias later can't change an already-queued send),
    // and bake the signature into body_html only. Personal with no alias falls
    // back to the contact address (from_email stays null → resolved at send).
    if (parsed.data.fromIdentity === 'personal') {
      const settings = await getInboxSettings(tx)
      const { personalFrom, signature } = await inboxResolvePersonalIdentity(tx, ctx.userId, settings)
      if (personalFrom) {
        const sig = signature ? `<br><br>${inboxSanitizeEmailHtml(signature)}` : ''
        await tx
          .updateTable('inbox_messages')
          .set({ from_email: personalFrom, body_html: sql`COALESCE(body_html, '') || ${sig}`, updated_at: new Date() })
          .where('id', '=', message.id)
          .execute()
      }
    }

    await inboxAssignIfUnassigned(tx, conversation.id, ctx.userId)
    await inboxUpdateConversationStatus(tx, conversation.id, 'pending')
    await inboxSetNeedsReview(tx, conversation.id, false)
    // A promoted draft carries its original created_at (possibly stale), so
    // stamp the conversation's last activity with the actual send moment.
    await inboxTouchLastMessage(tx, conversation.id, draftId ? new Date() : message.created_at, 'outbound')
    await inboxLogConversationEvent(tx, conversation.id, 'inbox_reply_queued', 'Reply queued', {
      userId: ctx.userId,
      extra: { messageId: message.id, direction: 'outbound' }
    })

    return { id: message.id, status: message.status }
  })
})
