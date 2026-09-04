// GET /api/gmail/drafts/:id
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const row = await gmailGetDraft(tx, ctx.userId, id)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
    return { draft: gmailDraftView(row) }
  })
})
