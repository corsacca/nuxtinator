// POST /api/gmail/labels — create a label in Gmail for one account.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'

const Body = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(1).max(100)
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const account = await gmailGetAccount(tx, ctx.userId, parsed.data.accountId)
    if (!account) throw createError({ statusCode: 404, statusMessage: 'Account not found' })
    const name = parsed.data.name
    if (name.startsWith('\\') || name.startsWith('[Gmail]') || name.toUpperCase() === 'INBOX') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid label name' })
    }
    try {
      await gmailRunOnAccountSession(account.id, session => session.createFolder(name))
    } catch (err) {
      throw createError({ statusCode: 502, statusMessage: `Gmail refused the label: ${(err as Error)?.message ?? 'unknown error'}` })
    }
    await tx
      .insertInto('gmail_labels')
      .values({ account_id: account.id, path: name, name: name.split('/').pop() || name, special_use: null, created_at: new Date() })
      .onConflict(oc => oc.columns(['account_id', 'path']).doNothing())
      .execute()
    const labels = await gmailListUserLabels(tx, [account.id])
    return { label: labels.find(l => l.path === name) ?? null }
  })
})
