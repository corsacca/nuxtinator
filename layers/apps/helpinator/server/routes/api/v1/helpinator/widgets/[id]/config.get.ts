// GET /api/v1/helpinator/widgets/:id/config — public. What the embeddable needs
// to render: appearance, and whether chat and handoff are available.
import { helpinatorInbox } from '#helpinator/inbox'
import { helpinatorPublicConfig } from '../../../../../../utils/helpinator-widgets'
import { helpinatorWithWidget } from '../../../../../../utils/helpinator-public'
import { helpinatorAiReady } from '../../../../../../utils/helpinator-bot'

export default defineEventHandler(async (event) => {
  return await helpinatorWithWidget(event, async (tx, widget) => {
    const aiConfigured = await helpinatorAiReady(tx)
    return helpinatorPublicConfig(widget, { aiConfigured, handoffAvailable: helpinatorInbox.available })
  })
})
