// POST /api/inbox/knowledge-entries
// Create a knowledge-base entry (write-tier: inbox.send). Used by the
// add-to-knowledge-base modal after a human reviews the AI proposal.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'

const Body = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  language: z.string().trim().min(1).max(8).optional(),
  sourceConversationId: z.string().uuid().optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const entry = await inboxCreateKnowledgeEntry(tx, {
      question: parsed.data.question,
      answer: parsed.data.answer,
      language: parsed.data.language,
      sourceConversationId: parsed.data.sourceConversationId ?? null,
      createdBy: ctx.userId
    })
    // KB entries feed AI drafting org-wide — additions leave an audit trail.
    await logEvent({
      eventType: 'inbox_knowledge_created',
      userId: ctx.userId,
      metadata: {
        message: 'Knowledge entry created',
        entryId: entry.id,
        question: entry.question.slice(0, 200),
        ...(parsed.data.sourceConversationId ? { sourceConversationId: parsed.data.sourceConversationId } : {})
      }
    }, tx)
    return { entry: inboxKnowledgeToDto(entry) }
  })
})
