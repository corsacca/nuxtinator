// Roles selectable in the org-admin UI: static (host + app-static) + custom
// (per-org). Mirrors the blueprint's `useAssignableRoles` but scoped to the
// active org so the role editor / invite modal can show the same single list.
//
// Both source endpoints are gated by `org.roles.read`. Callers should only
// invoke this composable inside a section the user can already access (e.g.
// the slideover roles editor, which is hidden behind `org.members.manage_roles`,
// and the invite modal, which is hidden behind `org.members.invite` — both
// implied by the admin role that grants org.roles.read).

export interface AssignableRole {
  key: string
  name: string
  description: string
  source: 'static' | 'custom'
  permissions: string[]
}

interface StaticRolesResponse {
  roles: Array<{
    key: string
    name: string
    description: string
    source: 'host' | 'app-static'
    permissions: string[]
  }>
}

interface CustomRolesResponse {
  roles: Array<{
    id: string
    name: string
    description: string | null
    permissions: string[]
  }>
}

export async function useOrgAssignableRoles(orgSlug: Ref<string> | ComputedRef<string>) {
  const slug = computed(() => unref(orgSlug))

  const [staticRes, customRes] = await Promise.all([
    useFetch<StaticRolesResponse>(() => `/api/o/${slug.value}/static-roles`, {
      watch: [slug],
      key: () => `org-static-roles-${slug.value}`,
      default: () => ({ roles: [] })
    }),
    useFetch<CustomRolesResponse>(() => `/api/o/${slug.value}/roles`, {
      watch: [slug],
      key: () => `org-custom-roles-${slug.value}`,
      default: () => ({ roles: [] })
    })
  ])

  const roles = computed<AssignableRole[]>(() => {
    const staticRoles: AssignableRole[] = (staticRes.data.value?.roles ?? []).map(r => ({
      key: r.key,
      name: r.name,
      description: r.description,
      source: 'static' as const,
      permissions: r.permissions
    }))
    const customRoles: AssignableRole[] = (customRes.data.value?.roles ?? []).map(r => ({
      key: r.name,
      name: r.name,
      description: r.description ?? '',
      source: 'custom' as const,
      permissions: r.permissions
    }))
    return [...staticRoles, ...customRoles]
  })

  const refresh = async () => {
    await Promise.all([staticRes.refresh(), customRes.refresh()])
  }

  return { roles, refresh }
}
