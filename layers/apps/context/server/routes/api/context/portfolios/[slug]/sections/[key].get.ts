// GET /api/context/portfolios/:slug/sections/:key — read one section.
import { withOrgPermission } from '#tenant/server'
import { getPortfolioBySlugOr404 } from '../../../../../../utils/portfolio-helpers'
import { loadSection, isKnownSectionKey } from '../../../../../../utils/section-helpers'
import { getPortfolioSections } from '../../../../../../utils/section-settings'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.read', async (tx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const key = getRouterParam(event, 'key') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)

    const known = await isKnownSectionKey(tx, p.id, key)
    if (!known) throw createError({ statusCode: 404, statusMessage: `Unknown section key: ${key}` })

    const section = await loadSection(tx, p.id, key)
    const defs = await getPortfolioSections(tx, p.id)
    const def = defs.find(d => d.key === key)

    return {
      portfolio_id: p.id,
      key,
      title: def?.title ?? key,
      description: def?.description ?? '',
      is_custom: def?.is_custom ?? false,
      content: section?.content ?? '',
      last_edited_at: section?.last_edited_at ?? null,
      last_edited_by: section?.last_edited_by ?? null
    }
  })
})
