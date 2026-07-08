// POST /api/inbox/tags { name, color? } → { tag }. Create-or-return by slug
// (idempotent); an out-of-vocabulary colour falls back to 'neutral'.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({ name: z.string().min(1).max(60), color: z.string().optional() })

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Tag name is required' })
    }
    return { tag: await inboxCreateTag(tx, parsed.data) }
  })
})
