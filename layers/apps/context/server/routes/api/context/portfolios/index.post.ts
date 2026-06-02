// POST /api/context/portfolios — create a portfolio in the active org.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { logCreate } from '#core/server/utils/activity-logger'
import { slugifyPortfolioName, ensureUniqueSlug } from '../../../../utils/portfolio-helpers'

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().max(20).nullable().optional(),
  slug: z.string().trim().regex(/^[a-z][a-z0-9-]{1,39}$/).optional()
})

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'context' }, 'context.portfolio.create', async (tx, ctx) => {
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid body', data: parsed.error.flatten() })
    }
    const { name, color } = parsed.data
    const requestedSlug = parsed.data.slug ?? slugifyPortfolioName(name)
    const slug = await ensureUniqueSlug(tx, requestedSlug)

    const inserted = await tx
      .insertInto('context_portfolios')
      .values({
        slug,
        name,
        color: color ?? null
      })
      .returning(['id', 'slug', 'name', 'color', 'icon_url', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow()

    logCreate('context_portfolios', inserted.id, ctx.userId, { slug: inserted.slug, name: inserted.name })

    return inserted
  })
})
