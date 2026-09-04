// PATCH /api/gmail/drafts/:id — autosave.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Address = z.object({ name: z.string().max(200).nullable().optional(), address: z.string().max(320) })

const Body = z.object({
  accountId: z.string().uuid().optional(),
  to: z.array(Address).max(100).optional(),
  cc: z.array(Address).max(100).optional(),
  bcc: z.array(Address).max(100).optional(),
  subject: z.string().max(998).nullable().optional(),
  bodyHtml: z.string().max(500_000).nullable().optional()
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    try {
      const row = await gmailUpdateDraft(tx, ctx.userId, id, {
        ...parsed.data,
        to: parsed.data.to?.map(a => ({ name: a.name ?? null, address: a.address })),
        cc: parsed.data.cc?.map(a => ({ name: a.name ?? null, address: a.address })),
        bcc: parsed.data.bcc?.map(a => ({ name: a.name ?? null, address: a.address }))
      })
      return { draft: gmailDraftView(row) }
    } catch (err) {
      if (err instanceof GmailDraftError) throw createError({ statusCode: err.statusCode, statusMessage: err.message })
      throw err
    }
  })
})
