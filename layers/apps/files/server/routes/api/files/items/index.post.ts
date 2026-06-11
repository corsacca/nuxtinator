// POST /api/files/items
// Creates an editable item — a markdown document (kind='doc', the default) or
// a self-contained HTML site (kind='site') — with an initial version snapshot.

import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { logCreate } from '#core/server/utils/activity-logger'
import { maxBodyBytes, bodyLimitMessage, normalizeTags, type EditableKind } from '../../../../utils/file-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'files' }, 'files.write', async (tx, ctx) => {
    const body = await readBody<{ kind?: string, title?: string, body_md?: string, tags?: string[] }>(event)
    const kind = (body?.kind ?? 'doc') as EditableKind
    const title = (body?.title ?? '').trim()
    const bodyMd = body?.body_md ?? ''
    const tags = normalizeTags(body?.tags)

    if (kind !== 'doc' && kind !== 'site') {
      throw createError({ statusCode: 400, statusMessage: 'kind must be doc or site.' })
    }
    if (!title) {
      throw createError({ statusCode: 400, statusMessage: 'A title is required.' })
    }
    if (Buffer.byteLength(bodyMd, 'utf8') > maxBodyBytes(kind)) {
      throw createError({ statusCode: 413, statusMessage: bodyLimitMessage(kind) })
    }

    const item = await tx
      .insertInto('files_items')
      .values({
        kind,
        title,
        body_md: bodyMd,
        tags,
        created_by: ctx.userId,
        last_edited_by: ctx.userId,
        last_edited_at: sql<Date>`now()`
      })
      .returning(['id', 'kind', 'title', 'body_md', 'tags', 'created_at'])
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('files_versions')
      .values({ item_id: item.id, title, content: bodyMd, edited_by: ctx.userId })
      .execute()

    logCreate('files_items', item.id, ctx.userId, { kind })

    return { item }
  })
})
