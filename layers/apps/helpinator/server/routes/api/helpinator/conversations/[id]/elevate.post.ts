// POST /api/helpinator/conversations/:id/elevate — staff elevation to the
// inbox. Only possible when the visitor left an email. Sends the visitor
// nothing: the conversation is assigned to the elevating user, who lands in the
// inbox composer to write the first reply. Requires inbox.send as well, since
// elevating means replying.
import { withOrgPermission } from '#tenant/server'
import { helpinatorGetConversationOr404 } from '../../../../../utils/helpinator-admin'
import { helpinatorGetWidgetOr404 } from '../../../../../utils/helpinator-widgets'
import {
  HelpinatorAlreadyHandedOff,
  helpinatorHandOff,
  type HelpinatorHandoffResult
} from '../../../../../utils/helpinator-conversations'

export default defineEventHandler(async (event) => {
  let result: HelpinatorHandoffResult
  try {
    result = await withOrgPermission(event, { appId: 'helpinator' }, 'helpinator.manage', async (tx, ctx) => {
      if (!(ctx.perms as Set<string>).has('inbox.send')) {
        throw createError({ statusCode: 403, statusMessage: 'Permission required: inbox.send' })
      }
      const conversation = await helpinatorGetConversationOr404(tx, getRouterParam(event, 'id') ?? '')
      if (!conversation.visitor_email) {
        throw createError({ statusCode: 400, statusMessage: 'The visitor did not leave an email address.' })
      }
      const widget = await helpinatorGetWidgetOr404(tx, conversation.widget_id)
      return await helpinatorHandOff(tx, {
        conversationId: conversation.id,
        widget,
        email: conversation.visitor_email,
        kind: 'staff',
        userId: ctx.userId,
        userAgent: null
      })
    })
  } catch (err) {
    if (err instanceof HelpinatorAlreadyHandedOff) {
      throw createError({ statusCode: 409, statusMessage: 'This conversation is already in the inbox.' })
    }
    throw err
  }
  await result.afterCommit().catch(e => console.warn('[helpinator] elevation side effects failed:', e))
  return { inboxConversationId: result.inboxConversationId }
})
