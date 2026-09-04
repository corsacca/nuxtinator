// GET /api/gmail/addresses?q= — compose autocomplete.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Query = z.object({ q: z.string().max(200).optional() })

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const parsed = Query.safeParse(getQuery(event))
    const q = parsed.success ? (parsed.data.q ?? '') : ''
    if (q.trim().length < 1) return { addresses: [] }
    return { addresses: await gmailSearchAddresses(tx, ctx.userId, q, 8) }
  })
})
