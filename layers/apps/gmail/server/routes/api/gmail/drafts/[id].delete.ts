// DELETE /api/gmail/drafts/:id — discard, including staged attachments.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    try {
      const ok = await gmailDeleteDraft(tx, ctx.userId, id)
      if (!ok) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
      return { ok: true }
    } catch (err) {
      if (err instanceof GmailDraftError) throw createError({ statusCode: err.statusCode, statusMessage: err.message })
      throw err
    }
  })
})
