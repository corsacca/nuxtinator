import { adminDb } from '#tenant/admin-db'
import { requireHostAdmin } from '#tenant/server'

// Host admin: list every org with member-count + app-count.
export default defineEventHandler(async (event) => {
  await requireHostAdmin(event)

  const rows = await adminDb
    .selectFrom('orgs')
    .leftJoin('memberships', 'memberships.org_id', 'orgs.id')
    .leftJoin('org_apps', 'org_apps.org_id', 'orgs.id')
    .select(eb => [
      'orgs.id as id',
      'orgs.slug as slug',
      'orgs.name as name',
      'orgs.suspended_at as suspended_at',
      'orgs.created_at as created_at',
      eb.fn.count<string>('memberships.id').distinct().as('member_count'),
      eb.fn.count<string>('org_apps.app_id').distinct().as('app_count')
    ])
    .groupBy(['orgs.id', 'orgs.slug', 'orgs.name', 'orgs.suspended_at', 'orgs.created_at'])
    .orderBy('orgs.name', 'asc')
    .execute()

  return {
    orgs: rows.map(r => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      suspended: !!r.suspended_at,
      created_at: r.created_at,
      member_count: Number(r.member_count),
      app_count: Number(r.app_count)
    }))
  }
})
