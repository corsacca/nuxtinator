// PUT /api/v1/helpinator/widgets/:id/email — public, bearer session token.
// The visitor's optional follow-up address. Saving it elevates nothing; it lets
// staff elevate the conversation to the inbox later.
import { z } from 'zod'
import { helpinatorWithWidget } from '../../../../../../utils/helpinator-public'
import { helpinatorBearer, helpinatorHashSessionToken } from '../../../../../../utils/helpinator-guards'
import { helpinatorFindSession, helpinatorSetVisitorEmail } from '../../../../../../utils/helpinator-conversations'

const Body = z.object({ email: z.string().trim().email().max(320).nullable() })

export default defineEventHandler(async (event) => {
  const token = helpinatorBearer(event)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Session token required' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Please enter a valid email address.' })
  return await helpinatorWithWidget(event, async (tx, widget) => {
    if (!widget.enabled) throw createError({ statusCode: 503, statusMessage: 'The help assistant is unavailable right now.' })
    const conversation = await helpinatorFindSession(tx, widget.id, helpinatorHashSessionToken(token))
    if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    await helpinatorSetVisitorEmail(tx, conversation.id, parsed.data.email?.toLowerCase() ?? null)
    return { visitorEmail: parsed.data.email?.toLowerCase() ?? null }
  })
})
