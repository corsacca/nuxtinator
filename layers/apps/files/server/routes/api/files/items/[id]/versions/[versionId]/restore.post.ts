// POST /api/files/items/:id/versions/:versionId/restore
// Re-saves a past snapshot as the current content, creating a new head
// version. Restore is itself an edit (mirrors the context layer).

import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'
import { loadItem, saveDocContent } from '../../../../../../../utils/file-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.write', async (tx, ctx) => {
    const id = getRouterParam(event, 'id') ?? ''
    const versionId = getRouterParam(event, 'versionId') ?? ''

    const item = await loadItem(tx, id)
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found.' })
    if (item.kind !== 'doc') {
      throw createError({ statusCode: 400, statusMessage: 'Only documents have versions.' })
    }

    const v = await tx
      .selectFrom('files_versions')
      .select(['id', 'title', 'content'])
      .where('id', '=', versionId)
      .where('item_id', '=', id)
      .executeTakeFirst()
    if (!v) throw createError({ statusCode: 404, statusMessage: 'Version not found.' })

    const { item: updated, versionId: newVersionId } = await saveDocContent(
      tx, id, { title: v.title, body_md: v.content }, ctx.userId
    )

    logUpdate('files_items', id, ctx.userId, { restored_from: v.id, new_version_id: newVersionId })

    return { item: updated, restored_from: v.id, version_id: newVersionId }
  })
})
