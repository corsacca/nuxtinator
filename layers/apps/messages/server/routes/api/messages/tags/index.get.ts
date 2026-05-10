// GET /api/messages/tags
// Returns the caller's tag vocabulary.

import { withOrgContext } from '#tenant/server'

export default defineEventHandler(async (event) => {
  return await withOrgContext(event, { appId: 'messages' }, async (tx, ctx) => {
    const rows = await tx
      .selectFrom('messages_user_tags')
      .select(['tag_name', 'created_at'])
      .where('user_id', '=', ctx.userId)
      .orderBy('tag_name', 'asc')
      .execute()
    return { tags: rows.map(r => ({ name: r.tag_name, created_at: r.created_at })) }
  })
})
