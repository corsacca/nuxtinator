// POST /api/inbox/suppressions/:channelId/clear
// Clear a false-positive bounce/complaint (or manual block) so sends to the
// address resume — the recovery path that CRM's manual-only clearSuppression
// blocks. Admin-gated (clearing a complaint suppression has deliverability/
// compliance weight); records who/when in the audit trail.
import { withOrgPermission } from '#tenant/server'
import { forceClearSuppression } from '#crm/server'
import { logEvent } from '#core/server/utils/activity-logger'

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channelId')!
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    if (!ctx.roles.includes('admin')) {
      throw createError({ statusCode: 403, statusMessage: 'Only an admin can clear a suppression' })
    }
    const cleared = await forceClearSuppression(tx, channelId)
    if (!cleared) {
      throw createError({ statusCode: 404, statusMessage: 'No active suppression for this address' })
    }
    await logEvent({
      eventType: 'inbox_suppression_cleared',
      tableName: 'crm_channels',
      recordId: channelId,
      userId: ctx.userId,
      metadata: { message: 'Suppression cleared' }
    }, tx)
    return { ok: true }
  })
})
