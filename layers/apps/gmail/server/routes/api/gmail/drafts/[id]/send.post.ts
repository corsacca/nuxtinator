// POST /api/gmail/drafts/:id/send — queue behind the undo window.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    try {
      const { sendAfter } = await gmailQueueDraft(tx, ctx.userId, id)
      return { queued: true, sendAfter: sendAfter.toISOString() }
    } catch (err) {
      if (err instanceof GmailDraftError) throw createError({ statusCode: err.statusCode, statusMessage: err.message })
      throw err
    }
  })
})
