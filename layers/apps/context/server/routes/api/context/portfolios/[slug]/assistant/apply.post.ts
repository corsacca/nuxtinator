// POST /api/context/portfolios/:slug/assistant/apply
// Apply a single proposed section update. Same write semantics as the
// section PUT endpoint — same validation, versioning, and limits.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { logUpdate } from '#core/server/utils/activity-logger'
import { getPortfolioBySlugOr404 } from '../../../../../../utils/portfolio-helpers'
import { saveSectionContent } from '../../../../../../utils/section-helpers'

const Body = z.object({
  section_key: z.string().min(1).max(64),
  proposed_content: z.string()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.assistant.apply', async (tx, ctx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }

    const { section, versionId } = await saveSectionContent(
      tx, p.id, parsed.data.section_key, parsed.data.proposed_content, ctx.userId
    )

    logUpdate('context_sections', section.id, ctx.userId, {
      source: 'assistant',
      portfolio_id: p.id,
      key: parsed.data.section_key,
      version_id: versionId
    })

    return {
      success: true,
      section_key: parsed.data.section_key,
      version_id: versionId
    }
  })
})
