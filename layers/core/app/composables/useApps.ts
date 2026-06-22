// Reads from /api/o/:orgSlug/_apps. The launcher (`AppSwitcher.vue`) consumes
// this. Empty state is fine — the launcher should render correctly with zero
// installed apps. When there's no active org (e.g. on `/orgs`, `/account/...`)
// the composable returns an empty list rather than calling the endpoint.

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
  const { slug } = useActiveOrg()
  const url = computed(() => slug.value ? `/api/o/${slug.value}/_apps` : '')

  const { data, refresh, pending, error } = await useFetch<AppsResponse>(url, {
    default: () => ({ apps: [] as AppEntry[] }),
    watch: [slug],
    immediate: !!slug.value,
    key: 'org-apps'
  })

  const apps = computed<AppEntry[]>(() => data.value?.apps ?? [])

  return { apps, refresh, pending, error }
}
