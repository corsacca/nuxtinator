// POST /api/context/assistant/conversations/:id/messages
// Send one user message: runs the model with the conversation's stored
// history and scope, persists both turns, and returns them. Proposed section
// updates are parsed only for users who could apply them.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { isAiConfigured, complete, getFeatureModel } from '#ai/server'
import {
  getOwnedConversationOr404,
  listMessages,
  insertMessage,
  touchConversation
} from '../../../../../../utils/assistant-conversations'
import { getPortfolioById } from '../../../../../../utils/portfolio-helpers'
import {
  CONTEXT_ASSISTANT_FEATURE,
  buildAssistantContext,
  historyToMessages,
  scopeFromConversation,
  stripUpdateBlocks
} from '../../../../../../utils/assistant'

const Body = z.object({
  message: z.string().min(1).max(20_000)
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.assistant.chat', async (tx, ctx) => {
    const id = getRouterParam(event, 'id') ?? ''
    const conversation = await getOwnedConversationOr404(tx, id, ctx.userId)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    if (!isAiConfigured()) {
      throw createError({ statusCode: 503, statusMessage: 'The assistant is not configured.' })
    }

    const portfolio = conversation.portfolio_id ? await getPortfolioById(tx, conversation.portfolio_id) : null
    if (conversation.portfolio_id && !portfolio) {
      throw createError({ statusCode: 404, statusMessage: 'Portfolio not found.' })
    }
    const scope = scopeFromConversation(conversation, portfolio)
    const canApply = ctx.perms.has('context.write') && ctx.perms.has('context.assistant.apply')

    const history = historyToMessages(await listMessages(tx, conversation.id))
    const assistant = await buildAssistantContext(tx, scope, canApply)

    const userMessage = await insertMessage(tx, {
      conversationId: conversation.id,
      role: 'user',
      content: parsed.data.message
    })

    const model = await getFeatureModel(tx, CONTEXT_ASSISTANT_FEATURE)
    const result = await complete({
      model,
      system: assistant.system,
      messages: [...history, { role: 'user', content: parsed.data.message }],
      tools: assistant.tools,
      onToolCall: assistant.onToolCall,
      maxTokens: 4096,
      maxToolRounds: 4
    })

    const proposals = canApply
      ? assistant.parseProposals(result.text).map(p => ({ ...p, status: 'pending' as const }))
      : []

    const assistantMessage = await insertMessage(tx, {
      conversationId: conversation.id,
      role: 'assistant',
      content: stripUpdateBlocks(result.text),
      proposals,
      contextLoaded: assistant.contextLoaded
    })
    await touchConversation(tx, conversation.id, history.length === 0 ? parsed.data.message : undefined)

    return {
      user_message: userMessage,
      assistant_message: assistantMessage,
      can_apply: canApply
    }
  })
})
