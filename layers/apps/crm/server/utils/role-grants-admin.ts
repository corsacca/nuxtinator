// View assembly for the role-grants admin surface (the roles × actions
// matrix in /crm/settings/permissions). Read-only over core's role
// machinery — the matrix needs the org's assignable role list and each
// role's *own* slug answers, so per-role sets come from getRolePermissions
// for that single role, mirroring the evaluator's fallback logic in
// type-permissions.ts (ctx.perms is the caller's pre-unioned set and cannot
// answer per-role questions).

import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { TenantContext } from '#tenant/server'
import { getAllStaticRoles } from '#core/server/utils/roles-registry'
import { getRolePermissions } from '#core/server/utils/rbac'
import type { CrmRecordTypeSetting } from './definition-settings'
import { CRM_RECORD_ACTIONS, permFor, type CrmRecordAction, type CrmTypeRoleGrants } from './crm-perms'

type Tx = Transaction<Database>

export interface CrmMatrixRole {
  key: string
  label: string
  /** True for custom_roles rows; false for host/app-static roles. */
  custom: boolean
}

export interface CrmEffectiveGrantCell {
  /** What the evaluator answers for a user holding only this role. */
  allowed: boolean
  /** Where the answer comes from: an explicit roleGrants row, the role's
   * slug set, or the admin always-allow bypass. */
  source: 'row' | 'slug' | 'admin'
  /** The role's slug-only answer — what an Inherit cell resolves to. Carried
   * on every cell (row-sourced ones included) so the matrix can render the
   * inherit state honestly when a row override is cleared client-side. */
  fallback: boolean
}

export type CrmTypeEffectiveGrants = Record<string, Record<CrmRecordAction, CrmEffectiveGrantCell>>

/** Response body of the role-grants GET/PUT routes. */
export interface CrmRoleGrantsView {
  actions: readonly CrmRecordAction[]
  roles: CrmMatrixRole[]
  grants: CrmTypeRoleGrants
  effective: CrmTypeEffectiveGrants
}

// The org's assignable roles: host + app-static roles (admin and member
// included — the matrix shows admin locked always-allow), then custom roles.
// RLS scopes custom_roles to the active org in multi mode; in single mode
// the table is global. Same query, both modes (the rbac.ts pattern).
export async function listMatrixRoles(tx: Tx): Promise<CrmMatrixRole[]> {
  const out: CrmMatrixRole[] = getAllStaticRoles()
    .map(r => ({ key: r.key, label: r.name, custom: false }))
  const customRows = await tx
    .selectFrom('custom_roles')
    .select('name')
    .orderBy('name', 'asc')
    .execute()
  for (const row of customRows) {
    // A custom role shadowed by a static name never resolves (rbac.ts checks
    // static tiers first), so it would be a dead matrix row.
    if (out.some(r => r.key === row.name)) continue
    out.push({ key: row.name, label: row.name, custom: true })
  }
  return out
}

// Builds the full matrix view for one record type. `effective` answers per
// role what the evaluator answers for a user holding only that role: admin
// always passes; a present roleGrants row IS the answer; otherwise the
// role's own slug set decides (see resolveTypePermission's decision order).
export async function buildRoleGrantsView(
  tx: Tx,
  ctx: TenantContext,
  type: CrmRecordTypeSetting
): Promise<CrmRoleGrantsView> {
  const roles = await listMatrixRoles(tx)
  const grants = type.roleGrants
  const effective: CrmTypeEffectiveGrants = {}
  // Sequential per role — queries on one transaction connection must not
  // interleave.
  for (const role of roles) {
    const slugs = await getRolePermissions(tx, [role.key], ctx.orgId)
    const cells = {} as Record<CrmRecordAction, CrmEffectiveGrantCell>
    for (const action of CRM_RECORD_ACTIONS) {
      const fallback = slugs.has(permFor(type.key, action))
      if (role.key === 'admin') {
        cells[action] = { allowed: true, source: 'admin', fallback }
      } else {
        const row = grants[role.key]?.[action]
        cells[action] = row === undefined
          ? { allowed: fallback, source: 'slug', fallback }
          : { allowed: row, source: 'row', fallback }
      }
    }
    effective[role.key] = cells
  }
  return { actions: CRM_RECORD_ACTIONS, roles, grants, effective }
}
