// App registry. Each app layer ships a Nitro plugin that calls
// `registerApp({...})` at boot. The launcher (`AppSwitcher.vue`) reads
// `getRegisteredApps()` (filtered by the current user's permissions via
// `/api/_apps`) and renders one tile per app.
//
// Adding an app to `extends:` is the only host edit required. The host
// has no hardcoded list of apps.
//
// ## Deferred: `runtimeConfig.hiddenApps`
//
// A future `runtimeConfig.hiddenApps: ['tasks']` extension point lets a
// deployment suppress an installed app without uninstalling it (drop it
// from the launcher and admin nav while keeping its routes / API / DB
// intact). The filter would apply inside `getRegisteredApps()` (and
// mirror through to `/api/_apps`). Not implemented in V3 — this comment
// is the design hook.

export interface AppEntry {
  id: string
  title: string
  path: string
  icon?: string
  description?: string
  // App-launcher visibility gate. Convention: every app declares an
  // `<id>.access` permission. Apps that omit `requiredPermission` show
  // for everyone.
  requiredPermission?: string
  order?: number
  // Declared at registration time. Only consulted when the apps-catalog
  // DB row for this app doesn't exist yet (fresh DB, or before the
  // seeder has run for the first time on this boot). Once a row exists,
  // it owns the status — see `seed-apps-catalog.ts` for the
  // "code seeds existence, host admin owns contents" rule.
  //   'available' — installed, on for every org unless explicitly disabled
  //   'default'   — installed, on for every org unless explicitly disabled
  //   'disabled'  — installed but kill-switched
  defaultStatus?: 'available' | 'default' | 'disabled'
}

const _apps = new Map<string, AppEntry>()

export function registerApp(entry: AppEntry): void {
  if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) return
  _apps.set(entry.id, entry)
}

export function getRegisteredApps(): AppEntry[] {
  return [..._apps.values()].sort((a, b) => {
    const ao = a.order ?? 100
    const bo = b.order ?? 100
    if (ao !== bo) return ao - bo
    return a.title.localeCompare(b.title)
  })
}

export function getRegisteredApp(id: string): AppEntry | null {
  return _apps.get(id) ?? null
}

export function __resetAppRegistryForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetAppRegistryForTests is not callable in production')
  }
  _apps.clear()
}
