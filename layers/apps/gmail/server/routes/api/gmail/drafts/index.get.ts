// GET /api/gmail/drafts — the caller's open drafts (draft, queued, failed).
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const rows = await gmailListDrafts(tx, ctx.userId)
    return { drafts: rows.map(gmailDraftView) }
  })
})
