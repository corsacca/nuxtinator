import type { Permission } from '#core/app/utils/permissions'

// User-global permissions composable. After multi-tenancy, the global user
// no longer carries roles or per-org perms — those live in the active org
// context (use `usePermissions()` from /api/o/:slug/* responses).
//
// `isHostAdmin` is the orthogonal single-bit check used to gate `/admin/*`
// routes. The server enforces it via `requireOperatorAdmin`; this composable
// just mirrors the value the JWT holder declared, with the server as the
// source of truth.
export const usePermissions = () => {
  const { user } = useAuth()

  const isHostAdmin = computed(() => !!(user.value as { is_admin?: boolean } | null)?.is_admin)

  const hasPermission = (_name: Permission | string) => false
  const hasRole = (_name: string) => false

  return {
    permissions: computed<string[]>(() => []),
    roles: computed<string[]>(() => []),
    hasPermission,
    hasRole,
    isAdmin: isHostAdmin,
    isHostAdmin
  }
}
