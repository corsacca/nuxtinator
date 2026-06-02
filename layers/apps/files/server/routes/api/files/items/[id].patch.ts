// PATCH /api/files/items/:id
// Edit a doc (title/body_md → new version), or rename / re-tag any item.
// Wiki-style: anyone with files.write may edit. Last-write-wins.

import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'
import { loadItem, saveDocContent } from '../../../../utils/file-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.write', async (tx, ctx) => {
    const id = getRouterParam(event, 'id') ?? ''
    const body = await readBody<{ title?: string, body_md?: string, tags?: string[] }>(event)

    const item = await loadItem(tx, id)
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Not found.' })

    const titleProvided = typeof body?.title === 'string'
    const bodyProvided = typeof body?.body_md === 'string'
    const tagsProvided = Array.isArray(body?.tags)

    if (titleProvided && !body!.title!.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Title cannot be empty.' })
    }

    // Doc content edits go through saveDocContent so a version snapshot lands.
    if (item.kind === 'doc' && (titleProvided || bodyProvided)) {
      await saveDocContent(tx, id, {
        title: titleProvided ? body!.title!.trim() : item.title,
        body_md: bodyProvided ? body!.body_md! : (item.body_md ?? '')
      }, ctx.userId)
    } else if (item.kind === 'file' && titleProvided) {
      await tx.updateTable('files_items')
        .set({ title: body!.title!.trim() })
        .where('id', '=', id)
        .execute()
    }

    // Tags are not versioned — update directly for either kind.
    if (tagsProvided) {
      await tx.updateTable('files_items')
        .set({ tags: normalizeTags(body!.tags) })
        .where('id', '=', id)
        .execute()
    }

    logUpdate('files_items', id, ctx.userId, { kind: item.kind })

    const updated = await loadItem(tx, id)
    return { item: updated }
  })
})

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return [...new Set(
    tags.filter(t => typeof t === 'string').map(t => (t as string).trim()).filter(Boolean)
  )]
}
