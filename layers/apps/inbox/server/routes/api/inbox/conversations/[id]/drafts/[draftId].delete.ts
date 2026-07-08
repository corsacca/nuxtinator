// DELETE /api/inbox/conversations/:id/drafts/:draftId
// Discards a shared draft. Scoped to (draftId, conversation, status='draft'):
// a promoted/sent message can't be deleted through this route, and a draft
// can't be deleted via another conversation's URL.

import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const draftId = getRouterParam(event, 'draftId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx) => {
    const deleted = await inboxDeleteDraft(tx, draftId, id)
    if (!deleted) {
      throw createError({ statusCode: 404, statusMessage: 'Draft not found' })
    }
    return { success: true }
  })
})
