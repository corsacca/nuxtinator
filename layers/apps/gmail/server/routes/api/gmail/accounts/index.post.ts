// POST /api/gmail/accounts — connect a mailbox. Verifies the app password
// against Gmail and discovers the special-use folders before storing.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().max(200).optional().nullable()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    try {
      const row = await gmailCreateAccount(tx, ctx.userId, { ...parsed.data, password: parsed.data.password.replace(/\s+/g, '') })
      return { account: gmailAccountView(row) }
    } catch (err) {
      if (err instanceof GmailSetupError) {
        throw createError({ statusCode: err.code === 'connect' ? 502 : 400, statusMessage: err.message })
      }
      throw err
    }
  })
})
