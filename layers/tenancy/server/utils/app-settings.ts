// Per-org apps view. Composes on top of core's catalog reader
// (`getApps`) by passing it as `loadDefaults` to a second
// `defineSettings`. See CLAUDE.md → "Settings pattern" for the shape.
//
// Three-tier resolution per app:
//
//   1. Registry default       — layer's `registerApp({ defaultStatus })`
//   2. Host-admin override    — `apps.status` (set via /admin/apps)
//   3. Org-admin override     — `org_apps.enabled` (set via /@<org>/settings/apps)
//
// `getApps` resolves (1) and (2). `getOrgApps` adds (3). The downstream
// helpers (`getOrgEnabledApps`, `isAppEnabledForOrg`) filter off its
// result.

import { defineSettings, type DbClient } from '#core/server/utils/settings'
import { getApps, type AppCatalogEntry } from '#core/server/utils/app-settings'
import type { AppStatus } from '#core/server/database/schema'
import type { OrgAppSource } from '../database/schema'

export interface OrgAppEntry extends AppCatalogEntry {
  enabled: boolean
  // Who flipped the org-level switch: 'org_admin' / 'host' / 'auto', or
  // null when no explicit row exists and the answer derives from the
  // catalog status alone.
  source: OrgAppSource | null
  // Host has disabled the app catalog-wide — org admin can't override.
  lockedByHost: boolean
  // Catalog-level status surfaced for UI tooltips ("Default: available").
  globalStatus: AppStatus
}

interface OrgAppRow {
  app_id: string
  enabled: boolean
  source: OrgAppSource
}

export const getOrgApps = defineSettings<AppCatalogEntry, OrgAppRow, OrgAppEntry>({
  // Defaults = the catalog merge, filtered to installed apps only. An
  // uninstalled orphan row can't be org-enabled, so it's not even worth
  // surfacing to org-level callers.
  loadDefaults: async (tx) => {
    const catalog = await getApps(tx)
    return catalog.filter(a => a.installed)
  },
  loadOverrides: async (tx, ctx) => {
    if (!ctx.orgId) throw new Error('getOrgApps requires ctx.orgId')
    const rows = await tx
      .selectFrom('org_apps')
      .select(['app_id', 'enabled', 'source'])
      .where('org_id', '=', ctx.orgId)
      .execute()
    return new Map(rows.map(r => [r.app_id, r as OrgAppRow]))
  },
  keyOf: app => app.id,
  merge: (app, orgRow) => {
    const a = app!
    const lockedByHost = a.status === 'disabled'
    let enabled: boolean
    if (lockedByHost) enabled = false
    else if (orgRow) enabled = orgRow.enabled
    else enabled = true
    return {
      ...a,
      globalStatus: a.status,
      enabled,
      source: orgRow?.source ?? null,
      lockedByHost
    }
  }
})

// Set of installed-and-enabled app IDs for an org. Used by the launcher
// (`/api/.../_apps`), the `app.enabled` gate inside `defineTenantHandler`,
// and any consumer that wants a quick "is X on for this org" check.
export async function getOrgEnabledApps(tx: DbClient, orgId: string): Promise<Set<string>> {
  const apps = await getOrgApps(tx, { orgId })
  return new Set(apps.filter(a => a.enabled).map(a => a.id))
}

export async function isAppEnabledForOrg(
  tx: DbClient,
  orgId: string,
  appId: string
): Promise<boolean> {
  const apps = await getOrgApps(tx, { orgId })
  return apps.some(a => a.id === appId && a.enabled)
}
