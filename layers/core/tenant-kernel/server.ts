// Single-mode `#tenant/server` kernel.
//
// The tenancy layer (when present) overrides this file via a Nuxt alias. App
// layer server code imports from `#tenant/server` and never knows which side.
//
// Single-mode contract:
//   - `defineTenantHandler` runs `requireAuth`, opens a Kysely transaction,
//     resolves the user's permission set from `users.roles[]`, then calls the
//     handler. There is no `app.current_org` GUC, no app-enable check, no
//     per-org overlay.
//   - `encodeFlowOrg` / `decodeFlowOrg` are no-ops — OAuth `state` carries
//     whatever the caller put in it.
//   - `requireOperatorAdmin` checks `users.is_admin`. Same in both modes; the
//     thing tenancy adds on top is BYPASSRLS DB-role plumbing for cross-org
//     reach.

import type { H3Event, EventHandler } from 'h3'
import type { Transaction } from 'kysely'
import { db } from '#core/server/utils/database'
import { requireAuth } from '#core/server/utils/auth'
import { getRolePermissions } from '#core/server/utils/rbac'
import type { Database } from '~/server/database/schema'
import type { Permission } from '#core/app/utils/permissions'

export interface TenantContext {
  userId: string
  orgId: string | null
  orgSlug: string | null
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

export function defineTenantHandler<T>(fn: TenantHandler<T>): EventHandler<unknown, Promise<T>>
export function defineTenantHandler<T>(opts: DefineTenantHandlerOpts, fn: TenantHandler<T>): EventHandler<unknown, Promise<T>>
export function defineTenantHandler<T>(
  optsOrFn: DefineTenantHandlerOpts | TenantHandler<T>,
  maybeFn?: TenantHandler<T>
): EventHandler<unknown, Promise<T>> {
  const fn = (typeof optsOrFn === 'function' ? optsOrFn : maybeFn) as TenantHandler<T>

  return defineEventHandler<unknown, Promise<T>>(async (event: H3Event) => {
    const authUser = requireAuth(event)
    return await db.transaction().execute(async (tx) => {
      const userRow = await tx
        .selectFrom('users')
        .select(['is_admin', 'roles'])
        .where('id', '=', authUser.userId)
        .executeTakeFirst()

      const roles = [...(userRow?.roles ?? [])]
      if (userRow?.is_admin) roles.push('admin')

      const perms = await getRolePermissions(tx, roles, null)

      return await fn(tx, {
        userId: authUser.userId,
        orgId: null,
        orgSlug: null,
        role: null,
        perms
      })
    })
  })
}

// Operator-admin gate. Same in single and multi modes — the bit on the user
// row is the source of truth. Tenancy layer adds BYPASSRLS DB-role plumbing
// on top for endpoints that need to read across orgs.
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

// OAuth flow helpers — bind the active org to the OAuth `state` so callbacks
// land in the correct org regardless of which tab the user comes back to.
// No-op in single mode.
export function encodeFlowOrg<S>(state: S): S {
  return state
}

export function decodeFlowOrg<S>(state: S): { state: S, orgSlug: string | null } {
  return { state, orgSlug: null }
}

// Open a transaction and run `fn(tx)` inside it. In single mode, just opens
// the transaction. In multi mode (overridden by the tenancy layer) this also
// reads the `active-org-slug` cookie, validates the user's membership, and
// runs `SET LOCAL app.current_org` before yielding.
//
// Used by code paths that aren't routed through `defineTenantHandler` but
// still need to write to RLS-protected tables (notably the OAuth flow's
// non-`/api/` endpoints, which can't go through the tenancy middleware).
export async function runInOrgTransaction<T>(
  _event: H3Event,
  fn: (tx: Transaction<Database>) => Promise<T>
): Promise<T> {
  return await db.transaction().execute(fn)
}

// Migration helper. In single mode this is a no-op — single deploys don't
// have an `orgs` table to reference and don't need RLS. Per-app tenancy
// migrations call this from inside `*_T<NNN>_*.ts` files; those files are
// only included by the migrator when the tenancy layer is loaded.
export async function enableTenantScoping(_db: unknown, _table: string): Promise<void> {
  // Intentional no-op. The tenancy layer overrides this with the real ALTER.
}

export async function disableTenantScoping(_db: unknown, _table: string): Promise<void> {
  // Intentional no-op.
}
