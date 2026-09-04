// POST /api/gmail/drafts/:id/unsend — undo while still queued.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const ok = await gmailUnqueueDraft(tx, ctx.userId, id)
    if (!ok) throw createError({ statusCode: 409, statusMessage: 'Too late — the message is already on its way' })
    return { ok: true }
  })
})
