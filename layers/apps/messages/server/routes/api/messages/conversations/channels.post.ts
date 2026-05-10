// POST /api/messages/conversations/channels
// Body: { name: string, description?: string }
// Creates a new public channel in the org. Permission: messages.channel.create.

import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'messages' }, 'messages.channel.create', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const { name, description } = parsed.data

    const normalized = name.replace(/^#/, '').trim()
    if (!normalized) {
      throw createError({ statusCode: 400, statusMessage: 'Channel name cannot be empty.' })
    }

    const inserted = await tx
      .insertInto('messages_conversations')
      .values({
        kind: 'channel',
        name: normalized,
        description: description ?? null,
        created_by: ctx.userId
      })
      .returning(['id', 'name', 'description', 'created_at'])
      .executeTakeFirstOrThrow()

    return {
      id: inserted.id,
      kind: 'channel' as const,
      name: inserted.name,
      description: inserted.description,
      created_at: inserted.created_at
    }
  })
})
