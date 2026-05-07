import type { AppEntry } from './useApps'

// Resolves the "current app" from the route by matching the longest app
// path prefix. Returns null when not inside any registered app.
export function useActiveApp(apps: Ref<AppEntry[]> | ComputedRef<AppEntry[]>) {
  const route = useRoute()

  return computed<AppEntry | null>(() => {
    let best: AppEntry | null = null
    for (const app of apps.value) {
      if (route.path === app.path || route.path.startsWith(app.path + '/')) {
        if (!best || app.path.length > best.path.length) best = app
      }
    }
    return best
  })
}
