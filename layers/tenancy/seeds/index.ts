import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { SeedContext } from '#core/seeds/types'
import type { OrgsTable, MembershipsTable, OrgAppsTable } from '../server/database/schema'
import type { CustomRolesTable, AppsTable } from '#core/server/database/schema'

interface TenancyDb {
  orgs: OrgsTable
  memberships: MembershipsTable
  org_apps: OrgAppsTable
  custom_roles: CustomRolesTable & { org_id: string }
  apps: AppsTable
}

const DEMO_ORG_SLUG = 'acme'
const DEMO_ORG_NAME = 'Acme Corp'

async function ensureOrg(db: Kysely<TenancyDb>, log: SeedContext['log']): Promise<{ id: string, slug: string }> {
  const existing = await db
    .selectFrom('orgs')
    .select(['id', 'slug'])
    .where('slug', '=', DEMO_ORG_SLUG)
    .executeTakeFirst()
  if (existing) {
    log(`org (exists): ${DEMO_ORG_SLUG}`)
    return { id: existing.id, slug: existing.slug }
  }
  const id = randomUUID()
  await db.insertInto('orgs').values({
    id,
    slug: DEMO_ORG_SLUG,
    name: DEMO_ORG_NAME,
    suspended_at: null
  }).execute()
  log(`org (new):    ${DEMO_ORG_SLUG}`)
  return { id, slug: DEMO_ORG_SLUG }
}

async function ensureMemberships(
  db: Kysely<TenancyDb>,
  orgId: string,
  users: SeedContext['users'],
  log: SeedContext['log']
): Promise<void> {
  for (const u of users) {
    const existing = await db
      .selectFrom('memberships')
      .select('id')
      .where('user_id', '=', u.id)
      .where('org_id', '=', orgId)
      .executeTakeFirst()
    if (existing) {
      log(`membership (exists): ${u.email}`)
      continue
    }
    await db.insertInto('memberships').values({
      id: randomUUID(),
      user_id: u.id,
      org_id: orgId,
      roles: u.isAdmin ? ['admin'] : ['member']
    }).execute()
    log(`membership (new):    ${u.email} -> ${u.isAdmin ? 'admin' : 'member'}`)
  }
}

// Enable every app in the catalog for the demo org. `source: 'host'` is
// the marker for "host operator opted this org in" (vs `auto` for
// default-status apps that auto-enable, or `org_admin` for org-self-service).
async function enableAllApps(
  db: Kysely<TenancyDb>,
  orgId: string,
  log: SeedContext['log']
): Promise<void> {
  const apps = await db.selectFrom('apps').select('id').execute()
  for (const a of apps) {
    await db.insertInto('org_apps')
      .values({ org_id: orgId, app_id: a.id, enabled: true, source: 'host' })
      .onConflict(oc => oc
        .columns(['org_id', 'app_id'])
        .doUpdateSet({ enabled: true, source: 'host', updated_at: new Date().toISOString() })
      )
      .execute()
    log(`org_apps:     ${a.id} enabled`)
  }
}

// Custom roles are org-scoped in multi-tenant mode (RLS + NOT NULL org_id
// DEFAULT current_org_id()). Seeding from a BYPASSRLS connection skips
// RLS, but the NOT NULL still applies — set the GUC for the duration of
// the inserts so the DEFAULT resolves.
async function seedOrgCustomRoles(
  db: Kysely<TenancyDb>,
  orgId: string,
  log: SeedContext['log']
): Promise<void> {
  const roles = [
    {
      name: 'Editor',
      description: 'Read + write across messages and apps.',
      permissions: ['messages.access', 'messages.read', 'messages.write', 'calendar.access', 'calendar.read', 'calendar.write', 'kanban.access', 'kanban.read', 'kanban.write']
    },
    {
      name: 'Viewer',
      description: 'Read-only across all apps.',
      permissions: ['messages.access', 'messages.read', 'calendar.access', 'calendar.read', 'kanban.access', 'kanban.read']
    }
  ]

  for (const r of roles) {
    const existing = await db
      .selectFrom('custom_roles')
      .select('id')
      .where('name', '=', r.name)
      .where('org_id', '=', orgId)
      .executeTakeFirst()
    if (existing) {
      log(`role (exists): ${r.name}`)
      continue
    }
    const now = new Date().toISOString()
    await db.insertInto('custom_roles').values({
      id: randomUUID(),
      created: now,
      updated: now,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      org_id: orgId
    }).execute()
    log(`role (new):    ${r.name}`)
  }
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const db = ctx.db as Kysely<TenancyDb>

  const org = await ensureOrg(db, ctx.log)
  ctx.orgId = org.id
  ctx.orgSlug = org.slug

  await ensureMemberships(db, org.id, ctx.users, ctx.log)
  await enableAllApps(db, org.id, ctx.log)
  await seedOrgCustomRoles(db, org.id, ctx.log)

  // Keep the GUC unset at script-end — connection lives in a pool but
  // postgres-js may reuse it for the next layer's seed. We explicitly
  // unset for safety; per-layer seeds set their own GUC inside transactions.
  await sql`SELECT set_config('app.current_org', '', false)`.execute(db)
}
