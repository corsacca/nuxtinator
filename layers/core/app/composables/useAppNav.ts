import { useActiveOrg } from '#tenant'

export interface NavItem {
  appId: string
  title: string
  path: string
  icon?: string
  requiredPermission?: string
  order?: number
}

interface NavResponse {
  items: NavItem[]
}

export async function useAppNav(appId: MaybeRefOrGetter<string>) {
  const appIdRef = computed(() => toValue(appId))
  const { slug } = useActiveOrg()

  const url = computed(() => slug.value ? `/api/o/${slug.value}/_nav` : '')

  const { data, refresh, pending, error } = await useFetch<NavResponse>(url, {
    key: 'app-nav',
    query: computed(() => ({ app: appIdRef.value })),
    watch: [appIdRef, slug],
    immediate: !!slug.value,
    default: () => ({ items: [] as NavItem[] })
  })

  const items = computed<NavItem[]>(() => data.value?.items ?? [])

  return { items, refresh, pending, error }
}
