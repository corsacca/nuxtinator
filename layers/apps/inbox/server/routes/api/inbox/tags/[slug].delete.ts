// DELETE /api/inbox/tags/:slug → strips the slug from the palette and from
// every conversation that carried it.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Tag slug is required' })
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx) => {
    await inboxDeleteTag(tx, slug)
    return { success: true }
  })
})
