// POST /api/context/portfolios/:slug/sections/:key/reindex — rebuild one
// section's vector chunks (the "re-embed" button after a failed save-time
// embed). Returns the new index state.
import { withOrgPermission } from '#tenant/server'
import { getPortfolioBySlugOr404 } from '../../../../../../../utils/portfolio-helpers'
import { loadSection, requireKnownSection } from '../../../../../../../utils/section-helpers'
import { getPortfolioSections } from '../../../../../../../utils/section-settings'
import { indexSection } from '../../../../../../../utils/section-index'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.write', async (tx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const key = getRouterParam(event, 'key') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)
    await requireKnownSection(tx, p.id, key)
    const section = await loadSection(tx, p.id, key)
    if (!section) return { index_state: 'none', index_error: null, chunks: 0 }
    const def = (await getPortfolioSections(tx, p.id)).find(d => d.key === key)
    const result = await indexSection(tx, section, def?.title ?? key)
    return { index_state: result.state, index_error: result.error, chunks: result.chunks }
  })
})
