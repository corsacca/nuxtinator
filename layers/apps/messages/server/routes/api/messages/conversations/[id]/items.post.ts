// POST /api/messages/conversations/:id/items
// Body: one of
//   { kind: 'markdown', body_md: string }
//   { kind: 'image' | 'file', upload: { storage_key, filename, mime, size_bytes } }
// Stores raw markdown source. Mentions are extracted from `[@name](uuid)`
// markdown link patterns in the body.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { requireConversationAccess } from '../../../../../utils/conversation-access'
import { extractMentions } from '../../../../../utils/markdown-mentions'
import { fanoutMentions } from '../../../../../utils/mention-fanout'
import { getDmMemberIds } from '../../../../../utils/dm-members'
import { notifyMessages } from '../../../../../utils/notification-creator'

const MarkdownBody = z.object({
  kind: z.literal('markdown'),
  body_md: z.string().min(1).max(64 * 1024)
})

const UploadBody = z.object({
  kind: z.enum(['image', 'file']),
  upload: z.object({
    storage_key: z.string().min(1),
    filename: z.string().min(1),
    mime: z.string().min(1),
    size_bytes: z.number().int().nonnegative()
  })
})

const Body = z.discriminatedUnion('kind', [MarkdownBody, UploadBody])

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.write', async (tx, ctx) => {
    const conversationId = getRouterParam(event, 'id')!
    const conv = await requireConversationAccess(tx, ctx.userId, conversationId)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const data = parsed.data

    let bodyMd: string | null = null
    let storageKey: string | null = null
    let filename: string | null = null
    let mime: string | null = null
    let sizeBytes: number | null = null

    if (data.kind === 'markdown') {
      bodyMd = data.body_md
    } else {
      storageKey = data.upload.storage_key
      filename = data.upload.filename
      mime = data.upload.mime
      sizeBytes = data.upload.size_bytes
    }

    const inserted = await tx
      .insertInto('messages_items')
      .values({
        conversation_id: conv.id,
        author_id: ctx.userId,
        kind: data.kind,
        body_md: bodyMd,
        storage_key: storageKey,
        filename,
        mime,
        size_bytes: sizeBytes
      })
      .returning(['id', 'created_at'])
      .executeTakeFirstOrThrow()

    const dmMemberIds = conv.kind === 'dm' ? await getDmMemberIds(tx, conv.id) : null

    let mentionRecipients: string[] = []
    // Mention fan-out (markdown items only).
    if (bodyMd) {
      const mentions = extractMentions(bodyMd)
      const mentionResult = await fanoutMentions(tx, mentions, {
        orgId: ctx.orgId,
        authorId: ctx.userId,
        conversationId: conv.id,
        itemId: inserted.id,
        dmMemberIds
      })
      mentionRecipients = mentionResult.notified
      await notifyMessages(tx, {
        recipients: mentionRecipients,
        actorId: ctx.userId,
        conversationId: conv.id,
        kind: 'mention',
        bodyMd
      })
    }

    // DM notifications for participants who weren't already mentioned (a
    // mention notification already covers them).
    if (dmMemberIds) {
      const dmRecipients = [...dmMemberIds]
        .filter(uid => uid !== ctx.userId && !mentionRecipients.includes(uid))
      await notifyMessages(tx, {
        recipients: dmRecipients,
        actorId: ctx.userId,
        conversationId: conv.id,
        kind: 'dm',
        bodyMd
      })
    }

    return { id: inserted.id, created_at: inserted.created_at }
  })
})
