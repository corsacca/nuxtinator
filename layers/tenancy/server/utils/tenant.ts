// Multi-mode `#tenant/server` kernel. Overrides the host's single-mode kernel
// via the alias module in `optional-tenancy/modules/tenant-kernel.ts`.
//
// Pipeline for `defineTenantHandler({ appId })`:
//   1. `requireAuth(event)` — JWT cookie → user identity.
//   2. Read `event.context.orgSlug` / `event.context.orgId` set by the tenancy
//      Nitro middleware (which validated the user's membership in this org).
//      404 if absent — caller didn't go through the middleware.
//   3. Open a Kysely transaction on `db` and `SET LOCAL app.current_org`
//      INSIDE that transaction. This is the only place the GUC gets set —
//      middleware doesn't because `SET LOCAL` is transaction-scoped and
//      pooled connections (PgBouncer txn-pool) wouldn't carry it forward.
//   4. Compute the user's effective permission set for this org.
//   5. If `opts.appId` was passed, 410 if that app is disabled for the org.
//   6. Refresh the `active-org-slug` cookie (30d) so bare-URL hits redirect.
//   7. Run the handler with `(tx, ctx)` where ctx has full org context.
import type { H3Event, EventHandler, EventHandlerRequest } from 'h3'
import type { Transaction, Kysely } from 'kysely'
import { sql } from 'kysely'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '#core/server/utils/database'
import { requireAuth } from '#core/server/utils/auth'
import { getRolePermissions } from '#core/server/utils/rbac'
import type { Database } from '#core/server/database/schema'
import type { Permission } from '#core/app/utils/permissions'

// App-enable resolution is registry-first — see `./app-settings.ts` for
// the three-tier merge. Imported here for use inside `defineTenantHandler`'s
// `appId` opt; external callers import the helpers directly from
// `./app-settings.ts` so Nitro auto-import doesn't see two copies.
import { isAppEnabledForOrg } from './app-settings'
import { adminDb } from './database-admin'

export interface TenantContext {
  userId: string
  orgId: string
  orgSlug: string
  orgName: string
  role: string | null
  perms: Set<Permission>
}

export interface DefineTenantHandlerOpts {
  appId?: string
}

export type TenantHandler<T> = (
  tx: Transaction<Database>,
  ctx: TenantContext
) => Promise<T> | T

// The shared core: validates middleware-supplied context, opens the txn, sets
// the GUC, and yields. Used by both `defineTenantHandler` (returns an
// EventHandler) and `withOrgContext` (function-call style, used inside an
// existing defineEventHandler).
async function runWithOrgContext<T>(
  event: H3Event,
  opts: DefineTenantHandlerOpts,
  fn: TenantHandler<T>
): Promise<T> {
  const authUser = requireAuth(event)
  const orgSlug = event.context.orgSlug as string | undefined
  const orgId = event.context.orgId as string | undefined
  const orgName = (event.context.orgName as string | undefined) ?? ''
  const memberRoles = (event.context.orgRoles as string[] | undefined) ?? []

  if (!orgSlug || !orgId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'This organization does not exist or you don\'t have access.'
    })
  }

  return await db.transaction().execute(async (tx) => {
    await sql`select set_config('app.current_org', ${orgId}, true)`.execute(tx)

    const perms = await getRolePermissions(tx, memberRoles, orgId)

    if (opts.appId) {
      const ok = await isAppEnabledForOrg(tx, orgId, opts.appId)
      if (!ok) {
        throw createError({
          statusCode: 410,
          statusMessage: `App "${opts.appId}" is not enabled for this organization.`
        })
      }
    }

    setCookie(event, 'active-org-slug', orgSlug, {
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      path: '/',
      httpOnly: false
    })

    const role = memberRoles[0] ?? null
    return await fn(tx, {
      userId: authUser.userId,
      orgId,
      orgSlug,
      orgName,
      role,
      perms
    })
  })
}

export function defineTenantHandler<T>(fn: TenantHandler<T>): EventHandler<EventHandlerRequest, Promise<T>>
export function defineTenantHandler<T>(opts: DefineTenantHandlerOpts, fn: TenantHandler<T>): EventHandler<EventHandlerRequest, Promise<T>>
export function defineTenantHandler<T>(
  optsOrFn: DefineTenantHandlerOpts | TenantHandler<T>,
  maybeFn?: TenantHandler<T>
): EventHandler<EventHandlerRequest, Promise<T>> {
  const opts: DefineTenantHandlerOpts = typeof optsOrFn === 'function' ? {} : optsOrFn
  const fn = (typeof optsOrFn === 'function' ? optsOrFn : maybeFn) as TenantHandler<T>
  return defineEventHandler<EventHandlerRequest, Promise<T>>(event => runWithOrgContext(event, opts, fn))
}

// Function-call style — for handlers already wrapped in `defineEventHandler`.
// Same semantics as `defineTenantHandler`, called from inside an existing
// handler body.
export function withOrgContext<T>(
  event: H3Event,
  fn: TenantHandler<T>
): Promise<T>
export function withOrgContext<T>(
  event: H3Event,
  opts: DefineTenantHandlerOpts,
  fn: TenantHandler<T>
): Promise<T>
export function withOrgContext<T>(
  event: H3Event,
  optsOrFn: DefineTenantHandlerOpts | TenantHandler<T>,
  maybeFn?: TenantHandler<T>
): Promise<T> {
  const opts: DefineTenantHandlerOpts = typeof optsOrFn === 'function' ? {} : optsOrFn
  const fn = (typeof optsOrFn === 'function' ? optsOrFn : maybeFn) as TenantHandler<T>
  return runWithOrgContext(event, opts, fn)
}

export function withOrgPermission<T>(
  event: H3Event,
  perm: Permission,
  fn: TenantHandler<T>
): Promise<T>
export function withOrgPermission<T>(
  event: H3Event,
  opts: DefineTenantHandlerOpts,
  perm: Permission,
  fn: TenantHandler<T>
): Promise<T>
export function withOrgPermission<T>(
  event: H3Event,
  a: Permission | DefineTenantHandlerOpts,
  b: Permission | TenantHandler<T>,
  c?: TenantHandler<T>
): Promise<T> {
  const hasOpts = typeof a === 'object'
  const opts: DefineTenantHandlerOpts = hasOpts ? (a as DefineTenantHandlerOpts) : {}
  const perm = (hasOpts ? b : a) as Permission
  const fn = (hasOpts ? c : b) as TenantHandler<T>
  return runWithOrgContext(event, opts, async (tx, ctx) => {
    if (!ctx.perms.has(perm)) {
      throw createError({ statusCode: 403, statusMessage: `Permission required: ${perm}` })
    }
    return await fn(tx, ctx)
  })
}

// Compute the effective permission set for a (user, org) pair. Used by
// admin/membership endpoints that need to display a user's permissions in
// an org without going through the request's own context. Looks up the
// user's membership roles, then resolves them through the per-org overlay.
export async function computePermsForOrg(
  client: Kysely<Database> | Transaction<Database>,
  userId: string,
  orgId: string
): Promise<Set<Permission>> {
  const membership = await client
    .selectFrom('memberships')
    .select('roles')
    .where('user_id', '=', userId)
    .where('org_id', '=', orgId)
    .executeTakeFirst()
  if (!membership) return new Set()
  return await getRolePermissions(client, membership.roles, orgId)
}

// Operator-admin gate. The bit (`users.is_admin`) lives in core; this is the
// same check, re-exported from the multi-mode kernel for symmetry. The thing
// the tenancy layer adds *on top* is BYPASSRLS DB-role plumbing
// (`adminDb` in `database-admin.ts`) for cross-org reach.
export async function requireOperatorAdmin(event: H3Event): Promise<{ userId: string }> {
  const authUser = requireAuth(event)
  const user = await db
    .selectFrom('users')
    .select('is_admin')
    .where('id', '=', authUser.userId)
    .executeTakeFirst()
  if (!user?.is_admin) {
    throw createError({ statusCode: 403, statusMessage: 'Operator admin required' })
  }
  return { userId: authUser.userId }
}

// Legacy alias — the host previously used the term "host admin" for this.
// Same semantics. Kept for backward compatibility with already-moved code.
export const requireHostAdmin = requireOperatorAdmin

// OAuth flow helpers. Bind the active org to the OAuth `state` so callbacks
// land in the correct org regardless of which tab the user comes back to.
function flowSecret(): string {
  const s = useRuntimeConfig().tenantFlowSecret
  if (!s) throw new Error('NUXT_TENANT_FLOW_SECRET is not set')
  return s
}

export function encodeFlowOrg<S extends string>(state: S, orgSlug: string | null): string {
  if (!orgSlug) return state
  const payload = `${state}|${orgSlug}`
  const sig = createHmac('sha256', flowSecret()).update(payload).digest('base64url')
  return `${payload}|${sig}`
}

export function decodeFlowOrg(combined: string): { state: string, orgSlug: string | null } {
  const parts = combined.split('|')
  if (parts.length !== 3) return { state: combined, orgSlug: null }
  const [state, slug, sig] = parts as [string, string, string]
  const expected = createHmac('sha256', flowSecret()).update(`${state}|${slug}`).digest()
  const actual = Buffer.from(sig, 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { state: combined, orgSlug: null }
  }
  return { state, orgSlug: slug }
}

// Open a transaction and run `fn(tx)` inside it with the active org's GUC set.
// Used by code paths that aren't routed through `defineTenantHandler` but
// still need to write to RLS-protected tables (notably the OAuth flow's
// non-`/api/` endpoints, which can't go through the tenancy middleware).
//
// Org discovery (in priority order):
//   1. `event.context.orgSlug` if set by upstream middleware
//   2. `active-org-slug` cookie
// If no org is found, opens the txn anyway with no GUC — RLS-protected
// INSERTs will fail loudly via `current_org_id() → NULL → NOT NULL` constraint.
export async function runInOrgTransaction<T>(
  event: H3Event,
  fn: (tx: Transaction<Database>) => Promise<T>
): Promise<T> {
  let orgId: string | undefined = event.context.orgId as string | undefined

  if (!orgId) {
    const slug = (event.context.orgSlug as string | undefined)
      ?? getCookie(event, 'active-org-slug')
    if (slug) {
      const row = await adminDb
        .selectFrom('orgs')
        .select('id')
        .where('slug', '=', slug)
        .executeTakeFirst()
      orgId = row?.id
    }
  }

  return await db.transaction().execute(async (tx) => {
    if (orgId) {
      await sql`select set_config('app.current_org', ${orgId}, true)`.execute(tx)
    }
    return await fn(tx)
  })
}

// Open a transaction scoped to the org that owns the given project. Used by
// public widget endpoints (notably /api/v1/feedback*) that receive a
// project_id from an unauthenticated cross-origin request and must operate
// in that project's tenant context.
//
// Resolves `projects.org_id` via BYPASSRLS (`adminDb`) since RLS would
// otherwise block the lookup, then opens a Kysely transaction on the regular
// `db` and `SET LOCAL app.current_org` inside that transaction.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function withProjectOrgContext<T>(
  _event: H3Event,
  projectId: string,
  fn: (tx: Transaction<Database>) => Promise<T>
): Promise<T> {
  if (!UUID_RE.test(projectId)) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  // Raw SQL — `org_id` is added dynamically to `projects` by the feedback
  // layer's `feedback_T010_enable_tenancy.ts` migration but isn't part of
  // the layer's Kysely schema definition.
  const result = await sql<{ org_id: string }>`
    select org_id from projects where id = ${projectId}
  `.execute(adminDb)
  const orgId = result.rows[0]?.org_id
  if (!orgId) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  return await db.transaction().execute(async (tx) => {
    await sql`select set_config('app.current_org', ${orgId}, true)`.execute(tx)
    return await fn(tx)
  })
}

// Operator-admin variant of `withProjectOrgContext`: looks up the org_id of an
// arbitrary RLS-protected record via adminDb (BYPASSRLS), opens a db
// transaction, sets `app.current_org` from that org, then runs the handler.
//
// Used by app-level operator-admin endpoints that need to triage a record by
// its primary key without knowing which org owns it — for example,
// `PATCH /api/admin/feedback/:id` on the feedback layer. App layers can't
// import `#tenant/admin-db` directly (tenancy contract), so this helper is
// the sanctioned path.
//
// The caller passes the table name + id; the helper interpolates the table
// name via `sql.ref()` to prevent SQL injection. UUIDs are required so the
// id is validated up front.
//
// Throws 404 with `notFoundMessage` if the record doesn't exist.
export async function withRecordOrgContext<T>(
  _event: H3Event,
  opts: {
    table: string
    id: string
    idColumn?: string
    notFoundMessage?: string
  },
  fn: (tx: Transaction<Database>) => Promise<T>
): Promise<T> {
  const { table, id } = opts
  const idColumn = opts.idColumn ?? 'id'
  const notFoundMessage = opts.notFoundMessage ?? 'Not found'

  if (!UUID_RE.test(id)) {
    throw createError({ statusCode: 404, statusMessage: notFoundMessage })
  }

  const result = await sql<{ org_id: string }>`
    select org_id from ${sql.ref(table)} where ${sql.ref(idColumn)} = ${id}
  `.execute(adminDb)
  const orgId = result.rows[0]?.org_id
  if (!orgId) {
    throw createError({ statusCode: 404, statusMessage: notFoundMessage })
  }

  return await db.transaction().execute(async (tx) => {
    await sql`select set_config('app.current_org', ${orgId}, true)`.execute(tx)
    return await fn(tx)
  })
}

// Schema-retrofit helper for app layer migrations. Per-app tenancy migrations
// live at `<layer>/migrations/<appId>_T<NNN>_*.ts` and call this. The tenancy
// layer's migration discovery module includes those files only when the
// tenancy layer is loaded; in single mode they don't run.
export async function enableTenantScoping(
  db: Kysely<unknown>,
  table: string
): Promise<void> {
  await sql`
    ALTER TABLE ${sql.ref(table)}
      ADD COLUMN org_id uuid NOT NULL DEFAULT current_org_id()
        REFERENCES orgs(id) ON DELETE CASCADE
  `.execute(db)
  await sql`ALTER TABLE ${sql.ref(table)} ENABLE ROW LEVEL SECURITY`.execute(db)
  await sql`
    CREATE POLICY tenant_isolation ON ${sql.ref(table)} FOR ALL
      USING       (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
      WITH CHECK  (org_id = nullif(current_setting('app.current_org', true), '')::uuid)
  `.execute(db)
}

export async function disableTenantScoping(
  db: Kysely<unknown>,
  table: string
): Promise<void> {
  await sql`DROP POLICY IF EXISTS tenant_isolation ON ${sql.ref(table)}`.execute(db)
  await sql`ALTER TABLE ${sql.ref(table)} DISABLE ROW LEVEL SECURITY`.execute(db)
  await sql`ALTER TABLE ${sql.ref(table)} DROP COLUMN org_id`.execute(db)
}
