// PATCH /api/inbox/conversations/:id
// Body: { status?, assignedUserId?, needsReview? }. Triage mutations:
// - closing clears the review flag (reviewed by definition)
// - entering 'spam' blocklists the sender and closes their threads; leaving
//   'spam' un-blocklists and clears the review flag (the status transition IS
//   the blocklist toggle)
// - assignee must hold inbox.access (a conversation can't be assigned to
//   someone who can't open it)

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  status: z.enum(['open', 'pending', 'closed', 'spam']).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  needsReview: z.boolean().optional()
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
    const patch = parsed.data

    if (patch.assignedUserId !== undefined) {
      if (patch.assignedUserId) {
        const allowed = await inboxUsersWithAccess(tx, ctx.orgId)
        if (!allowed.includes(patch.assignedUserId)) {
          throw createError({ statusCode: 400, statusMessage: 'Assignee cannot access the inbox' })
        }
      }
      await inboxAssignConversation(tx, id, patch.assignedUserId)
      await inboxLogConversationEvent(
        tx, id,
        patch.assignedUserId ? 'inbox_assigned' : 'inbox_unassigned',
        patch.assignedUserId ? 'Assigned' : 'Unassigned',
        { userId: ctx.userId, extra: { assignedUserId: patch.assignedUserId } }
      )
    }

    if (patch.status && patch.status !== conversation.status) {
      // Spam is a sender-level verdict (blocklist), not mere triage — it
      // gates on the send permission like the other org-shaping mutations.
      if ((patch.status === 'spam' || conversation.status === 'spam') && !ctx.perms.has('inbox.send')) {
        throw createError({ statusCode: 403, statusMessage: 'Requires inbox.send' })
      }
      if (patch.status === 'spam') {
        await inboxBlockChannel(tx, conversation.channel_id, ctx.userId)
        await inboxCloseForChannelAsSpam(tx, conversation.channel_id)
        // Log the sender's address (not the FK): the blocklist row — with its
        // created_by — is deleted on unblock, so this is the surviving trail.
        const channel = await tx.selectFrom('crm_channels').select('value').where('id', '=', conversation.channel_id).executeTakeFirst()
        await inboxLogConversationEvent(tx, id, 'inbox_spam_marked', 'Marked as spam', {
          userId: ctx.userId, extra: { channel: channel?.value ?? null }
        })
      } else if (conversation.status === 'spam') {
        await inboxUnblockChannel(tx, conversation.channel_id)
        await inboxReopenFromSpam(tx, conversation.channel_id)
        await inboxUpdateConversationStatus(tx, id, patch.status)
        // Leaving spam clears the review flag: a held-then-spammed thread must
        // not keep inflating the (status-independent) needs-review count.
        await inboxSetNeedsReview(tx, id, false)
        const channel = await tx.selectFrom('crm_channels').select('value').where('id', '=', conversation.channel_id).executeTakeFirst()
        await inboxLogConversationEvent(tx, id, 'inbox_spam_unmarked', 'Removed from spam', {
          userId: ctx.userId, extra: { channel: channel?.value ?? null, status: patch.status }
        })
      } else {
        await inboxUpdateConversationStatus(tx, id, patch.status)
        await inboxLogConversationEvent(tx, id, 'inbox_status_changed', `Status → ${patch.status}`, {
          userId: ctx.userId, extra: { from: conversation.status, to: patch.status }
        })
      }
      if (patch.status === 'closed') {
        await inboxSetNeedsReview(tx, id, false)
      }
    }

    if (patch.needsReview !== undefined) {
      await inboxSetNeedsReview(tx, id, patch.needsReview)
    }

    const updated = await inboxGetConversation(tx, id)
    return {
      id: updated!.id,
      status: updated!.status,
      assignedUserId: updated!.assigned_user_id,
      needsReview: updated!.needs_review
    }
  })
})
