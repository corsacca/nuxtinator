import { getRouterParam } from 'h3'
import { adminDb } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'
import { logEvent } from '#core/server/utils/activity-logger'

// Hard-delete an org. Every org-scoped row goes with it via FK cascade.
// The body must echo the org's slug ({ confirm: '<slug>' }) so a stray or
// replayed call can't drop a tenant.
//
// The `org.deleted` hook fires BEFORE the row delete: subscribers need the
// org's rows still present (and RLS-readable) to collect external resources
// the cascade would otherwise strand — e.g. the inbox layer's S3 objects.
// Handlers are best-effort: a thrown handler logs and never blocks the
// delete.
export default defineEventHandler(async (event) => {
  const { userId } = await requireHostAdmin(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'orgId required' })

  const org = await adminDb
    .selectFrom('orgs')
    .select(['id', 'slug', 'name'])
    .where('id', '=', orgId)
    .executeTakeFirst()
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })

  const body = await readBody(event).catch(() => null)
  if (body?.confirm !== org.slug) {
    throw createError({ statusCode: 400, statusMessage: 'Confirmation mismatch — body.confirm must equal the org slug' })
  }

  const nitro = useNitroApp()
  try {
    await nitro.hooks.callHook('org.deleted', { orgId: org.id, slug: org.slug })
  } catch (err) { console.warn('[hook org.deleted]', err) }

  await adminDb.deleteFrom('orgs').where('id', '=', orgId).execute()

  logEvent({
    eventType: 'org_deleted',
    userId,
    metadata: { orgId, slug: org.slug, name: org.name }
  }).catch(() => {})

  return { id: orgId, deleted: true }
})
