// User's org memberships. Cached in `useState` per session — call `refresh()`
// after creating/joining an org or after slug rename.
export interface UserOrg {
  id: string
  slug: string
  name: string
  suspended: boolean
  roles: string[]
}

interface OrgsResponse {
  orgs: UserOrg[]
}

export async function useUserOrgs() {
  const { data, refresh, pending, error } = await useFetch<OrgsResponse>('/api/orgs', {
    default: () => ({ orgs: [] }),
    key: 'user-orgs'
  })

  const orgs = computed<UserOrg[]>(() => data.value?.orgs ?? [])

  return { orgs, refresh, pending, error }
}
