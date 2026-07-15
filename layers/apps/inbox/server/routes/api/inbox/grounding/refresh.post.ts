// POST /api/inbox/grounding/refresh
// Manually re-sync the active org's AI grounding documents from its configured
// source URLs. Gated by inbox.send. The permission check runs in a quick tx that
// only reads the org id; the sync then runs on its own scoped transactions so
// the request doesn't hold a transaction open across the (slow) page fetches.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const { orgId } = await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (_tx, ctx) => ({
    orgId: ctx.orgId
  }))
  return await syncInboxGroundingForOrg(orgId)
})
