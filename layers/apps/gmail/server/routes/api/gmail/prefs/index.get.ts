// GET /api/gmail/prefs — effective preferences (defaults merged with overrides).
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'gmail' }, 'gmail.access', async (tx, ctx) => {
    return { prefs: await gmailGetPrefs(tx, ctx.userId), limits: GMAIL_PREF_LIMITS }
  })
})
