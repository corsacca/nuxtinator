// Feeds the launcher (`AppSwitcher.vue` / `AppRail.vue`). Multi-tenant mode
// reads the per-org feed `/api/o/:orgSlug/_apps`; single-tenant mode reads the
// host-level `/api/_apps`. Empty state is fine — the launcher renders correctly
// with zero apps. In multi-tenant mode with no active org (e.g. on `/orgs`,
// `/account/...`) the composable returns an empty list rather than calling the
// endpoint.

import { useActiveOrg } from '#tenant'

export interface AppEntry {
  id: string
  title: string
  path: string
  icon?: string
  description?: string
  requiredPermission?: string
  order?: number
}

interface AppsResponse {
  apps: AppEntry[]
}

export async function useApps() {
  const tenancyOn = !!useRuntimeConfig().public.tenancy
  const { user } = useAuth()
  const { slug } = useActiveOrg()
  // Both feeds require auth. Single-tenant: host-level feed (no org).
  // Multi-tenant: per-org feed, which also needs an active slug — empty URL
  // until both are present so we don't 401/404.
  const url = computed(() => {
    if (!user.value) return ''
    if (!tenancyOn) return '/api/_apps'
    return slug.value ? `/api/o/${slug.value}/_apps` : ''
  })

  const { data, refresh, pending, error } = await useFetch<AppsResponse>(url, {
    default: () => ({ apps: [] as AppEntry[] }),
    watch: [slug, user],
    immediate: !!user.value && (!tenancyOn || !!slug.value),
    key: 'org-apps'
  })

  const apps = computed<AppEntry[]>(() => data.value?.apps ?? [])

  return { apps, refresh, pending, error }
}
