// GET /api/inbox/tags → { tags }. Palette management rides the read/triage
// permission (anyone who can open the inbox), matching the picker's reach.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    return { tags: await inboxListTags(tx) }
  })
})
