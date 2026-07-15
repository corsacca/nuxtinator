// Per-user crm.* grant administration — thin wrappers over core's
// permission-grants services with this surface's rules: only crm.*-prefixed
// slugs are listed or writable (this is the CRM settings surface, not a
// general grants admin), and the target must be a real user — an active-org
// member in multi mode, same membership rule as the user directory
// (routes/api/crm/users.get.ts) and share targets. Grants are slug-level and
// additive: they pass through the type evaluator untouched, so a role-keyed
// per-type deny can never subtract them.

import type { Transaction } from 'kysely'
import { z } from 'zod'
import type { Database } from '#core/server/database/schema'
import type { TenantContext } from '#tenant/server'
import { listUserPermissionGrants } from '#core/server/utils/permission-grants'
import { isRegisteredPermission, getPermissionMeta } from '#core/server/utils/permissions-registry'

type Tx = Transaction<Database>

export interface CrmUserGrantEntry {
  permission: string
  title: string
  /** True when the slug is no longer registered (its layer is gone). Orphan
   * grants stop granting but stay listed so they can be revoked. */
  orphan: boolean
  grantedBy: string | null
  createdAt: Date
}

const uuidSchema = z.string().uuid()

// uuid columns reject malformed parameters with a SQL error, so validate up
// front and 400 instead.
export async function requireGrantTarget(
  tx: Tx,
  ctx: TenantContext,
  userId: string
): Promise<void> {
  if (!uuidSchema.safeParse(userId).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid user id.' })
  }
  let qb = tx
    .selectFrom('users')
    .select('users.id')
    .where('users.id', '=', userId)
  if (ctx.orgId) {
    const orgId = ctx.orgId
    qb = qb.where(eb => eb.exists(
      eb.selectFrom('memberships')
        .select('memberships.user_id')
        .whereRef('memberships.user_id', '=', 'users.id')
        .where('memberships.org_id', '=', orgId)
    ))
  }
  const user = await qb.executeTakeFirst()
  if (!user) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown user.' })
  }
}

/** The slug rule for this surface — grants managed here are CRM-owned. */
export function assertCrmPermissionSlug(permission: string): void {
  if (!permission.startsWith('crm.')) {
    throw createError({ statusCode: 400, statusMessage: 'Only crm.* permissions can be managed here.' })
  }
}

// The user's direct grants filtered to crm.*, with display meta resolved
// from the runtime permission registry. Orphans keep their raw slug as the
// title — there is no registry entry left to ask.
export async function listCrmUserGrants(tx: Tx, userId: string): Promise<CrmUserGrantEntry[]> {
  const rows = await listUserPermissionGrants(tx, userId)
  return rows
    .filter(r => r.permission.startsWith('crm.'))
    .map(r => ({
      permission: r.permission,
      title: getPermissionMeta(r.permission)?.title ?? r.permission,
      orphan: !isRegisteredPermission(r.permission),
      grantedBy: r.granted_by,
      createdAt: r.created_at
    }))
}
