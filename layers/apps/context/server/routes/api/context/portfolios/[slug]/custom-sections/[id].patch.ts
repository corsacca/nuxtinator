// PATCH /api/context/portfolios/:slug/custom-sections/:id — update a custom
// section definition's title/description/order. Key is immutable once created.
import { z } from 'zod'
import { sql } from 'kysely'
import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'
import { getPortfolioBySlugOr404 } from '../../../../../../utils/portfolio-helpers'

const Body = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  order: z.number().int().min(0).optional()
}).strict()

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.section.custom', async (tx, ctx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const id = getRouterParam(event, 'id') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const patch = parsed.data
    if (Object.keys(patch).length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update.' })
    }

    const existing = await tx
      .selectFrom('context_custom_section_definitions')
      .select(['id', 'key'])
      .where('id', '=', id)
      .where('portfolio_id', '=', p.id)
      .executeTakeFirst()
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Custom section not found.' })

    const updated = await tx
      .updateTable('context_custom_section_definitions')
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.order !== undefined ? { order: patch.order } : {}),
        updated_at: sql<Date>`now()`
      })
      .where('id', '=', existing.id)
      .returning(['id', 'key', 'title', 'description', 'order', 'created_by', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow()

    logUpdate('context_custom_section_definitions', updated.id, ctx.userId, {
      portfolio_id: p.id, patch
    })

    return updated
  })
})
