// GET /api/gmail/messages/:id/body — the sanitised body, fetched from Gmail
// and cached on first request.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const userId = await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (_tx, ctx) => ctx.userId)
  try {
    const body = await gmailEnsureBody(userId, id)
    if (!body) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
    return body
  } catch (err) {
    if (err instanceof GmailBodyUnavailable) throw createError({ statusCode: 409, statusMessage: err.message })
    throw err
  }
})
