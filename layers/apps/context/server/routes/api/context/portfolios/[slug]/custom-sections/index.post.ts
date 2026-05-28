// POST /api/context/portfolios/:slug/custom-sections — add a custom section
// definition to the portfolio. Auto-slugifies the title into a key.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { logCreate } from '#core/server/utils/activity-logger'
import { getPortfolioBySlugOr404 } from '../../../../../../utils/portfolio-helpers'
import { CONTEXT_SECTION_KEYS, slugifySectionTitle } from '../../../../../../utils/section-catalog'

const Body = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  order: z.number().int().min(0).optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.section.custom', async (tx, ctx) => {
    const slug = getRouterParam(event, 'slug') ?? ''
    const p = await getPortfolioBySlugOr404(tx, slug)

    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const { title, description, order } = parsed.data
    const key = slugifySectionTitle(title)
    if (!key) throw createError({ statusCode: 400, statusMessage: 'Title must contain at least one alphanumeric character.' })
    if (CONTEXT_SECTION_KEYS.has(key)) {
      throw createError({ statusCode: 409, statusMessage: `Key "${key}" collides with a built-in section.` })
    }
    const existing = await tx
      .selectFrom('context_custom_section_definitions')
      .select('id')
      .where('portfolio_id', '=', p.id)
      .where('key', '=', key)
      .executeTakeFirst()
    if (existing) {
      throw createError({ statusCode: 409, statusMessage: `Custom section "${key}" already exists in this portfolio.` })
    }

    const inserted = await tx
      .insertInto('context_custom_section_definitions')
      .values({
        portfolio_id: p.id,
        key,
        title,
        description: description ?? '',
        order: order ?? 0,
        created_by: ctx.userId
      })
      .returning(['id', 'key', 'title', 'description', 'order', 'created_by', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow()

    logCreate('context_custom_section_definitions', inserted.id, ctx.userId, {
      portfolio_id: p.id, key, title
    })

    return inserted
  })
})
