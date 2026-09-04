// POST /api/gmail/threads/:id/actions
// Body: { action, label?, wakeAt? }. Writes through to Gmail (except snooze,
// which is local) and returns the refreshed thread.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  action: z.enum(GMAIL_THREAD_ACTIONS),
  label: z.string().max(100).optional(),
  wakeAt: z.string().datetime({ offset: true }).optional()
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    try {
      await gmailApplyThreadAction(tx, ctx.userId, id, parsed.data.action, {
        label: parsed.data.label,
        wakeAt: parsed.data.wakeAt ? new Date(parsed.data.wakeAt) : undefined
      })
    } catch (err) {
      if (err instanceof GmailActionError) throw createError({ statusCode: err.statusCode, statusMessage: err.message })
      if ((err as Error)?.name === 'GmailAuthError') throw createError({ statusCode: 502, statusMessage: 'Gmail rejected the account credentials' })
      throw createError({ statusCode: 502, statusMessage: `Gmail update failed: ${(err as Error)?.message ?? 'unknown error'}` })
    }
    const detail = await gmailGetThread(tx, ctx.userId, id)
    return { thread: detail?.thread ?? null }
  })
})
