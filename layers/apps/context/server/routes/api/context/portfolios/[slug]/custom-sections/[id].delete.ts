// DELETE /api/context/portfolios/:slug/custom-sections/:id
// Deletes the custom-section definition. Does NOT cascade content rows in
// `context_sections` — they become orphans hidden by `defineSettings`
// (`includeOrphans: false` for the read-side merge). Re-creating a custom
// section with the same key resurfaces any orphaned content.
import { withOrgPermission } from '#tenant/server'
import { logDelete } from '#core/server/utils/activity-logger'
import { getPortfolioBySlugOr404 } from '../../../../../../utils/portfolio-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.section.custom', async (tx, ctx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const id = getRouterParam(event, 'id') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)
    const existing = await tx
      .selectFrom('context_custom_section_definitions')
      .select(['id', 'key'])
      .where('id', '=', id)
      .where('portfolio_id', '=', p.id)
      .executeTakeFirst()
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Custom section not found.' })

    await tx
      .deleteFrom('context_custom_section_definitions')
      .where('id', '=', existing.id)
      .execute()

    logDelete('context_custom_section_definitions', existing.id, ctx.userId, {
      portfolio_id: p.id, key: existing.key
    })

    return { ok: true, id: existing.id }
  })
})
