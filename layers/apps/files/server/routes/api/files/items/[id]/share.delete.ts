// DELETE /api/files/items/:id/share — revoke the public share link (null the token).

import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'
import { loadItem } from '../../../../../utils/file-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.write', async (tx, ctx) => {
    const id = getRouterParam(event, 'id') ?? ''

    const item = await loadItem(tx, id)
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found.' })

    await tx
      .updateTable('files_items')
      .set({ share_token: null })
      .where('id', '=', id)
      .execute()

    logUpdate('files_items', id, ctx.userId, { action: 'share_revoked' })
    return { ok: true }
  })
})
