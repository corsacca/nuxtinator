import type { Kysely, Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { Permission } from '#core/app/utils/permissions'
import { isRegisteredPermission } from './permissions-registry'

// Per-user additive permission grants (`user_permission_grants`).
//
// Effective perms = union(role perms) ∪ direct grants — the tenant kernels
// call `getUserGrantedPermissions` inside their per-request transaction and
// union the result into `ctx.perms`. Grants are additive-only: there is no
// deny concept anywhere in the stack.
//
// Org scoping is transparent here. In multi-tenant mode the table carries
// `org_id NOT NULL DEFAULT current_org_id()` + RLS (tenancy_014 retrofit), so
// any read/write issued inside a tenant transaction (GUC set) is scoped to
// the active org automatically — the queries below never mention org_id. In
// single-tenant mode the table has no org_id and rows are user-global. Same
// queries, both modes (the custom_roles pattern).

type DbClient = Kysely<Database> | Transaction<Database>

export interface UserPermissionGrantRow {
  id: string
  permission: string
  granted_by: string | null
  created_at: Date
}

// All grant rows for a user, for display/management surfaces. Unlike the
// kernel-facing set reader below, this does NOT filter unregistered slugs —
// admin UIs need to see (and revoke) orphan grants left behind by an
// uninstalled layer.
export async function listUserPermissionGrants(
  client: DbClient,
  userId: string
): Promise<UserPermissionGrantRow[]> {
  return await client
    .selectFrom('user_permission_grants')
    .select(['id', 'permission', 'granted_by', 'created_at'])
    .where('user_id', '=', userId)
    .orderBy('permission')
    .execute()
}

// The user's direct grants as a permission set, for the kernels' effective-
// perms union. Slugs no longer in the runtime registry are skipped — a stored
// grant only grants while its permission exists in code (same rule
// `getRolePermissions` applies to custom_roles rows).
export async function getUserGrantedPermissions(
  client: DbClient,
  userId: string
): Promise<Set<Permission>> {
  const rows = await client
    .selectFrom('user_permission_grants')
    .select('permission')
    .where('user_id', '=', userId)
    .execute()
  const set = new Set<Permission>()
  for (const row of rows) {
    if (isRegisteredPermission(row.permission)) set.add(row.permission as Permission)
  }
  return set
}

// Grant a permission directly to a user. Validates the slug against the
// runtime registry (400 on unknown — grants are never written for slugs that
// don't exist in code) and records the granting user. Idempotent: granting
// an already-held permission is a no-op.
//
// `ctx` is the caller's tenant context (`TenantContext` from either kernel);
// only `userId` is needed, so the parameter is typed structurally to keep
// this file free of `#tenant` imports.
export async function grantUserPermission(
  tx: Transaction<Database>,
  ctx: { userId: string },
  userId: string,
  permission: string
): Promise<void> {
  if (!isRegisteredPermission(permission)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown permission: ${permission}` })
  }
  const user = await tx
    .selectFrom('users')
    .select('id')
    .where('id', '=', userId)
    .executeTakeFirst()
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }
  await tx
    .insertInto('user_permission_grants')
    .values({ user_id: userId, permission, granted_by: ctx.userId })
    .onConflict(oc => oc.doNothing())
    .execute()
}

// Remove a direct grant. No slug validation — orphan grants (slug no longer
// registered, e.g. after a layer uninstall) must stay revocable. Deleting a
// grant the user doesn't hold is a no-op.
export async function revokeUserPermission(
  tx: Transaction<Database>,
  _ctx: { userId: string },
  userId: string,
  permission: string
): Promise<void> {
  await tx
    .deleteFrom('user_permission_grants')
    .where('user_id', '=', userId)
    .where('permission', '=', permission)
    .execute()
}
