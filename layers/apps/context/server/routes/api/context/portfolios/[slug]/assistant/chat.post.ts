// POST /api/context/portfolios/:slug/assistant/chat
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { getPortfolioBySlugOr404 } from '../../../../../../utils/portfolio-helpers'
import {
  buildSystemPrompt,
  makeLoadSectionHandler,
  parseProposedUpdates,
  stripUpdateBlocks,
  LOAD_SECTION_TOOL
} from '../../../../../../utils/assistant'
import { getAnthropicClient } from '../../../../../../utils/anthropic-client'

const Body = z.object({
  message: z.string().min(1).max(20_000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).max(50).optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.assistant.chat', async (tx, ctx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    const userCanEdit = ctx.perms.has('context.write')
    const { prompt, contextLoaded, sectionsByKey, knownKeys } = await buildSystemPrompt(tx, p, userCanEdit)
    const handler = makeLoadSectionHandler(tx, p, sectionsByKey, contextLoaded, knownKeys)

    const messages = [
      ...(parsed.data.history ?? []),
      { role: 'user' as const, content: parsed.data.message }
    ]

    const client = getAnthropicClient()
    const reply = await client.call({
      system: prompt,
      messages,
      tools: [LOAD_SECTION_TOOL],
      handleTool: (name, input) => handler.handle(name, input)
    })

    const proposed = userCanEdit ? parseProposedUpdates(reply, knownKeys, sectionsByKey) : []
    const cleanReply = stripUpdateBlocks(reply)

    return {
      reply: cleanReply,
      proposed_updates: proposed,
      context_loaded: contextLoaded,
      can_edit: userCanEdit
    }
  })
})
