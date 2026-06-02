// POST /api/files/items/:id/share — issue (or reissue) a public share token.
// Reissue overwrites the previous token, so old links stop working.

import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'
import { loadItem } from '../../../../../utils/file-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.write', async (tx, ctx) => {
    const id = getRouterParam(event, 'id') ?? ''

    const item = await loadItem(tx, id)
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found.' })

    const updated = await tx
      .updateTable('files_items')
      .set({ share_token: sql<string>`gen_random_uuid()` })
      .where('id', '=', id)
      .returning('share_token')
      .executeTakeFirstOrThrow()

    logUpdate('files_items', id, ctx.userId, { action: 'share_issued' })

    return { share_token: updated.share_token }
  })
})
