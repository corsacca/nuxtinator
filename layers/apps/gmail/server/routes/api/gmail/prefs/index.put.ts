// PUT /api/gmail/prefs — store overrides; values equal to the default are dropped.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  undoSendSeconds: z.number().int().min(0).max(60).optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    return { prefs: await gmailSetPrefs(tx, ctx.userId, parsed.data) }
  })
})
