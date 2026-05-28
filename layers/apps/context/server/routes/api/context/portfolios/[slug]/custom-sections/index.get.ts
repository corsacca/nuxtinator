// GET /api/context/portfolios/:slug/custom-sections — list custom section defs.
import { withOrgPermission } from '#tenant/server'
import { getPortfolioBySlugOr404 } from '../../../../../../utils/portfolio-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.read', async (tx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)
    const rows = await tx
      .selectFrom('context_custom_section_definitions')
      .select(['id', 'key', 'title', 'description', 'order', 'created_by', 'created_at', 'updated_at'])
      .where('portfolio_id', '=', p.id)
      .orderBy('order', 'asc')
      .orderBy('created_at', 'asc')
      .execute()
    return { custom_sections: rows }
  })
})
