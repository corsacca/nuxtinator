import type { Permission } from '#core/app/utils/permissions'
import { useActiveOrg } from '#tenant'

interface PermsResponse {
  perms: string[]
  roles: string[]
}

// Client permission store. Fetches the caller's effective permission list
// (union of role perms and direct grants, computed server-side by the tenant
// kernel) from `/api/_perms` (single-tenant) or `/api/o/:slug/_perms`
// (multi-tenant), and answers `hasPermission` from it.
//
// Fetches once and caches under the `user-perms` key; refetches when the
// active org or the signed-in user changes (same reactivity as `useApps` /
// `useAppNav`). Until the fetch resolves — and whenever there is no user or,
// in multi mode, no active org — the store is empty: `hasPermission` returns
// false, never throws. The server remains the enforcement point; this store
// only drives UI (show/hide, read-only rendering).
//
// `isHostAdmin` is the orthogonal single-bit check used to gate `/admin/*`
// routes. The server enforces it via `requireOperatorAdmin`; this composable
// just mirrors the value the JWT holder declared, with the server as the
// source of truth.
export const usePermissions = () => {
  const tenancyOn = !!useRuntimeConfig().public.tenancy
  const { user } = useAuth()
  const { slug } = useActiveOrg()

  const isHostAdmin = computed(() => !!(user.value as { is_admin?: boolean } | null)?.is_admin)

  // Both feeds require auth. Single-tenant: host-level feed (no org).
  // Multi-tenant: per-org feed, which also needs an active slug — empty URL
  // until both are present so we don't 401/404.
  const url = computed<string>(() => {
    if (!user.value) return ''
    if (!tenancyOn) return '/api/_perms'
    return slug.value ? `/api/o/${slug.value}/_perms` : ''
  })

  // useAsyncData + $fetch<T, string> rather than useFetch: pinning the request
  // type to `string` keeps $fetch off the deep typed-route instantiation that
  // trips TS2589 as the app's route union grows. The empty-url guard returns the
  // default without hitting the network.
  const { data, refresh, pending, error } = useAsyncData<PermsResponse>(
    'user-perms',
    () => (url.value ? $fetch<PermsResponse, string>(url.value) : Promise.resolve({ perms: [], roles: [] })),
    {
      watch: [slug, user],
      immediate: !!user.value && (!tenancyOn || !!slug.value),
      default: () => ({ perms: [] as string[], roles: [] as string[] })
    }
  )

  const permissions = computed<string[]>(() => data.value?.perms ?? [])
  const roles = computed<string[]>(() => data.value?.roles ?? [])

  const hasPermission = (name: Permission | string) => permissions.value.includes(name)
  const hasRole = (name: string) => roles.value.includes(name)

  return {
    permissions,
    perms: permissions,
    roles,
    hasPermission,
    hasRole,
    refresh,
    pending,
    error,
    isAdmin: isHostAdmin,
    isHostAdmin
  }
}
