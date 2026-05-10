import { withOrgPermission } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'
import { validateSlug } from '#core/app/utils/slug'

// Edit org name / slug. Slug change is a hard cutover — no redirects.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.settings.write', async (tx, ctx) => {
    const body = await readBody(event)
    const next: { name?: string, slug?: string, updated_at: string } = {
      updated_at: new Date().toISOString()
    }

    if (typeof body?.name === 'string') {
      const name = body.name.trim()
      if (name.length < 2) {
        throw createError({ statusCode: 400, statusMessage: 'Name must be at least 2 characters.' })
      }
      next.name = name
    }
    if (typeof body?.slug === 'string') {
      const slug = body.slug.trim()
      const slugError = validateSlug(slug)
      if (slugError) {
        throw createError({ statusCode: 400, statusMessage: slugError })
      }
      next.slug = slug
    }

    if (!next.name && !next.slug) {
      return { id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName }
    }

    try {
      await tx
        .updateTable('orgs')
        .set(next)
        .where('id', '=', ctx.orgId)
        .execute()
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        throw createError({ statusCode: 409, statusMessage: 'That slug is already in use' })
      }
      throw err
    }

    logEvent({
      eventType: 'org_updated',
      userId: ctx.userId,
      metadata: { orgId: ctx.orgId, changes: next }
    }).catch(() => {})

    return {
      id: ctx.orgId,
      slug: next.slug ?? ctx.orgSlug,
      name: next.name ?? ctx.orgName
    }
  })
})
