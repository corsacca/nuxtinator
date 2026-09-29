// GET /api/helpinator/status — what the admin UI can offer on this deployment.
import { withOrgPermission } from '#tenant/server'
import { helpinatorInbox } from '#helpinator/inbox'
import { helpinatorAiReady } from '../../../utils/helpinator-bot'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'helpinator' }, 'helpinator.access', async (tx, ctx) => ({
    aiConfigured: await helpinatorAiReady(tx),
    inboxAvailable: helpinatorInbox.available,
    canManage: ctx.perms.has('helpinator.manage'),
    canElevate: helpinatorInbox.available && ctx.perms.has('helpinator.manage') && (ctx.perms as Set<string>).has('inbox.send')
  }))
})
