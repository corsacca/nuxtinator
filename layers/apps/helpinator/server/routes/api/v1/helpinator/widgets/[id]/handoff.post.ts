// POST /api/v1/helpinator/widgets/:id/handoff — public, bearer session token.
// "Still need help?": the transcript becomes an open, unassigned inbox
// conversation (source 'helpinator') and the visitor gets the inbox auto-ack
// with a copy of the transcript. At most once per conversation.
import { z } from 'zod'
import { getHeader } from 'h3'
import { helpinatorWithWidget } from '../../../../../../utils/helpinator-public'
import {
  helpinatorBearer,
  helpinatorClientKey,
  helpinatorHashSessionToken,
  helpinatorRateLimit
} from '../../../../../../utils/helpinator-guards'
import {
  HelpinatorAlreadyHandedOff,
  helpinatorFindSession,
  helpinatorHandOff,
  type HelpinatorHandoffResult
} from '../../../../../../utils/helpinator-conversations'

const Body = z.object({ email: z.string().trim().email().max(320) })

export default defineEventHandler(async (event) => {
  const token = helpinatorBearer(event)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Session token required' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Please enter a valid email address.' })
  await helpinatorRateLimit(event, 'ratelimit.helpinator.handoff', 'client', helpinatorClientKey(event), 5, 60 * 60_000)

  let result: HelpinatorHandoffResult
  try {
    result = await helpinatorWithWidget(event, async (tx, widget) => {
      const conversation = await helpinatorFindSession(tx, widget.id, helpinatorHashSessionToken(token))
      if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
      return await helpinatorHandOff(tx, {
        conversationId: conversation.id,
        widget,
        email: parsed.data.email.toLowerCase(),
        kind: 'visitor',
        userId: null,
        userAgent: getHeader(event, 'user-agent') ?? null
      })
    })
  } catch (err) {
    if (err instanceof HelpinatorAlreadyHandedOff) return { status: 'already_handed_off' }
    throw err
  }

  // Post-commit: staff notification + the auto-ack. Best-effort by contract.
  await result.afterCommit().catch(err => console.warn('[helpinator] handoff side effects failed:', err))
  return { status: 'handed_off' }
})
