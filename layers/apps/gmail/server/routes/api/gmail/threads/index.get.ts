// GET /api/gmail/threads
// Query: view, account, label, q (local filter), gq (Gmail search
// passthrough), limit, offset. Returns { items, total }.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Query = z.object({
  view: z.enum(GMAIL_VIEWS).optional(),
  account: z.string().uuid().optional(),
  label: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  gq: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
})

export default defineEventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid query', data: parsed.error.flatten() })
  }
  const q = parsed.data
  const userId = await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (_tx, ctx) => ctx.userId)
  // The Gmail passthrough talks to the account sessions; it runs outside the
  // request transaction so a slow search never holds a DB connection.
  const threadIds = q.gq?.trim() ? await gmailSearchThreadIds(db, userId, q.gq.trim(), q.account ?? null) : null
  return await gmailListThreads(db, {
    userId,
    view: q.view ?? (threadIds ? 'all' : 'inbox'),
    accountId: q.account ?? null,
    label: q.label ?? null,
    q: q.q ?? null,
    threadIds,
    limit: q.limit ?? 50,
    offset: q.offset ?? 0
  })
})
