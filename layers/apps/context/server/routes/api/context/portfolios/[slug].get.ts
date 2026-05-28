// GET /api/context/portfolios/:slug — read a single portfolio.
import { withOrgPermission } from '#tenant/server'
import { getPortfolioBySlugOr404 } from '../../../../utils/portfolio-helpers'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.read', async (tx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)
    return p
  })
})
