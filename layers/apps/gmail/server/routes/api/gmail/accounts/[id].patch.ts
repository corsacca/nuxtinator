// PATCH /api/gmail/accounts/:id — display name, signature, or a new app
// password (re-verified against Gmail).
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  displayName: z.string().trim().max(200).nullable().optional(),
  signatureHtml: z.string().max(20_000).nullable().optional(),
  password: z.string().min(8).max(200).optional()
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const existing = await gmailGetAccount(tx, ctx.userId, id)
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
    try {
      if (parsed.data.password) await gmailUpdateAccountCredentials(tx, ctx.userId, id, parsed.data.password.replace(/\s+/g, ''))
      const row = await gmailUpdateAccountProfile(tx, ctx.userId, id, {
        displayName: parsed.data.displayName,
        signatureHtml: parsed.data.signatureHtml === undefined ? undefined : (parsed.data.signatureHtml ? gmailSanitizeOutboundHtml(parsed.data.signatureHtml) : null)
      })
      return { account: gmailAccountView(row!) }
    } catch (err) {
      if (err instanceof GmailSetupError) {
        throw createError({ statusCode: err.code === 'connect' ? 502 : 400, statusMessage: err.message })
      }
      throw err
    }
  })
})
