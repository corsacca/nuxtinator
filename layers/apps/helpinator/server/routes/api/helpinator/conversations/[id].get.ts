// GET /api/helpinator/conversations/:id — one transcript, read-only, with the
// sections the bot grounded each reply on.
import { withOrgPermission } from '#tenant/server'
import { helpinatorAdminConversation, helpinatorGetConversationOr404 } from '../../../../utils/helpinator-admin'
import { helpinatorListMessages } from '../../../../utils/helpinator-conversations'
import { helpinatorListSections } from '../../../../utils/helpinator-bot'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'helpinator' }, 'helpinator.access', async (tx) => {
    const conversation = await helpinatorGetConversationOr404(tx, getRouterParam(event, 'id') ?? '')
    const messages = await helpinatorListMessages(tx, conversation.id)
    const titles = new Map((await helpinatorListSections(tx, conversation.portfolio_id)).map(s => [s.key, s.title]))
    return {
      conversation: helpinatorAdminConversation(conversation),
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        model: m.model,
        created_at: m.created_at,
        sections_loaded: (m.sections_loaded ?? []).map(key => ({ key, title: titles.get(key) ?? key }))
      }))
    }
  })
})
