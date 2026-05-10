import { adminDb } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'
import { validateSlug } from '#core/app/utils/slug'

// Host-admin org edit. Cross-org variant of `PATCH /api/o/:slug`. Operates on
// `adminDb` (BYPASSRLS) — host admin doesn't impersonate org members.
export default defineEventHandler(async (event) => {
  const { userId } = await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'orgId required' })

  const body = await readBody(event)
  const next: { name?: string, slug?: string, suspended_at?: string | null, updated_at: string } = {
    updated_at: new Date().toISOString()
  }

  if (typeof body?.name === 'string') next.name = body.name.trim()
  if (typeof body?.slug === 'string') {
    const slug = body.slug.trim()
    const slugError = validateSlug(slug)
    if (slugError) {
      throw createError({ statusCode: 400, statusMessage: slugError })
    }
    next.slug = slug
  }
  if (body?.suspended === true) next.suspended_at = new Date().toISOString()
  if (body?.suspended === false) next.suspended_at = null

  try {
    const updated = await adminDb
      .updateTable('orgs')
      .set(next)
      .where('id', '=', orgId)
      .returning(['id', 'slug', 'name', 'suspended_at'])
      .executeTakeFirst()

    if (!updated) {
      throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
    }

    logEvent({
      eventType: 'org_updated',
      userId,
      metadata: { orgId, changes: next }
    }).catch(() => {})

    return updated
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'That slug is already in use' })
    }
    throw err
  }
})
