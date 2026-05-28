// GET /api/context/portfolios/:slug/sections — list sections with metadata.
import { withOrgPermission } from '#tenant/server'
import { getPortfolioBySlugOr404 } from '../../../../../../utils/portfolio-helpers'
import { getPortfolioSections } from '../../../../../../utils/section-settings'

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.read', async (tx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)

    const defs = await getPortfolioSections(tx, p.id)
    const rows = await tx
      .selectFrom('context_sections as s')
      .leftJoin('users as u', 'u.id', 's.last_edited_by')
      .select([
        's.section_key',
        's.content',
        's.last_edited_at',
        's.last_edited_by',
        'u.display_name as last_edited_by_name'
      ])
      .where('s.portfolio_id', '=', p.id)
      .execute()

    const byKey = new Map(rows.map(r => [r.section_key as string, r]))

    return {
      portfolio_id: p.id,
      sections: defs.map((d) => {
        const r = byKey.get(d.key)
        const content = (r?.content ?? '') as string
        const wordCount = content.trim().length > 0
          ? content.trim().split(/\s+/).length
          : 0
        return {
          key: d.key,
          title: d.title,
          description: d.description,
          order: d.order,
          is_custom: d.is_custom,
          custom_id: d.custom_id,
          word_count: wordCount,
          has_content: content.trim().length > 0,
          last_edited_at: r?.last_edited_at ?? null,
          last_edited_by: r?.last_edited_by ?? null,
          last_edited_by_name: r?.last_edited_by_name ?? null
        }
      })
    }
  })
})
