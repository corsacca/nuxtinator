// PUT /api/inbox/knowledge-entries/:entryId
// Partial update of a knowledge entry — edit text, or archive/restore
// (write-tier: inbox.send). Only supplied keys change.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  question: z.string().trim().min(1).optional(),
  answer: z.string().trim().min(1).optional(),
  language: z.string().trim().min(1).max(8).optional(),
  status: z.enum(['active', 'archived']).optional()
})

export default defineEventHandler(async (event) => {
  const entryId = getRouterParam(event, 'entryId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const entry = await inboxUpdateKnowledgeEntry(tx, entryId, parsed.data)
    if (!entry) throw createError({ statusCode: 404, statusMessage: 'Knowledge entry not found' })
    return { entry: inboxKnowledgeToDto(entry) }
  })
})
