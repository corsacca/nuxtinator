// Apps-catalog settings read. Built on `defineSettings` — see CLAUDE.md
// → "Settings pattern".
//
// Two readers, two scopes:
//
//   getApps(tx)             — merged catalog from the host-admin POV.
//                             Registry entries get their declared default
//                             status when no DB row exists; orphan DB rows
//                             (layer uninstalled but row left behind) are
//                             appended with `installed: false` so a host
//                             admin can purge them.
//
//   The tenancy layer composes its per-org reader (`getOrgApps`) on top of
//   `getApps` — see `layers/tenancy/server/utils/app-settings.ts`. Two
//   levels of `defineSettings` stacked: catalog merge first, then org
//   overlay on top.

import { defineSettings, type DbClient } from './settings'
import { getRegisteredApps, type AppEntry } from './app-registry'
import type { AppStatus } from '#core/server/database/schema'

export interface AppCatalogEntry {
  id: string
  title: string
  description: string | undefined
  icon: string | undefined
  path: string | undefined
  requiredPermission: string | undefined
  order: number | undefined
  status: AppStatus
  // True when a registered layer claims this app. False = orphan DB row
  // (layer uninstalled but catalog row remains).
  installed: boolean
  created_at: Date | string | null
  updated_at: Date | string | null
}

interface AppRow {
  id: string
  status: AppStatus
  created_at: Date | string
  updated_at: Date | string
}

export const getApps = defineSettings<AppEntry, AppRow, AppCatalogEntry>({
  loadDefaults: () => getRegisteredApps(),
  loadOverrides: async (tx) => {
    const rows = await tx
      .selectFrom('apps')
      .select(['id', 'status', 'created_at', 'updated_at'])
      .execute()
    return new Map(rows.map(r => [r.id, r as AppRow]))
  },
  keyOf: app => app.id,
  merge: (app, row) => {
    if (app) {
      return {
        id: app.id,
        title: app.title,
        description: app.description,
        icon: app.icon,
        path: app.path,
        requiredPermission: app.requiredPermission,
        order: app.order,
        status: row?.status ?? app.defaultStatus ?? 'available',
        installed: true,
        created_at: row?.created_at ?? null,
        updated_at: row?.updated_at ?? null
      }
    }
    // Orphan branch — row exists, no registered layer. `row` is guaranteed
    // defined here (defineSettings only calls merge(undefined, …) for orphans).
    return {
      id: row!.id,
      title: row!.id,
      description: undefined,
      icon: undefined,
      path: undefined,
      requiredPermission: undefined,
      order: undefined,
      status: row!.status,
      installed: false,
      created_at: row!.created_at,
      updated_at: row!.updated_at
    }
  },
  includeOrphans: true
})

// Look up a single merged catalog entry. Used by the patch endpoint to read
// the current status of an app before flipping it, and by ad-hoc consumers.
export async function getApp(tx: DbClient, appId: string): Promise<AppCatalogEntry | null> {
  const all = await getApps(tx)
  return all.find(a => a.id === appId) ?? null
}
