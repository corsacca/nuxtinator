// Org user directory for user_select fields: one shared fetch of the user
// picker endpoint, cached in useState so formatters, avatar cells, and
// pickers all resolve ids from the same copy.

/** A user as served by GET /api/crm/users. */
export interface CrmUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

// In-flight request dedupe. SSR is off, so plain module state is safe.
let usersPromise: Promise<void> | null = null

export function useCrmUsers() {
  const users = useState<CrmUser[]>('crm:users', () => [])
  const usersLoaded = useState<boolean>('crm:users-loaded', () => false)

  const byId = computed(() => new Map(users.value.map(u => [u.id, u])))

  async function fetchUsers(): Promise<void> {
    const res = await $fetch<{ items: CrmUser[] }>('/api/crm/users', { query: { limit: 50 } })
    users.value = res.items
    usersLoaded.value = true
  }

  /** Fetches the directory once; concurrent callers share the request. */
  function ensureUsers(): Promise<void> {
    if (usersLoaded.value) return Promise.resolve()
    if (!usersPromise) {
      usersPromise = fetchUsers().finally(() => {
        usersPromise = null
      })
    }
    return usersPromise
  }

  /** Typeahead over the directory; an empty query returns the cached list. */
  async function searchUsers(q: string): Promise<CrmUser[]> {
    const query = q.trim()
    if (!query) {
      await ensureUsers()
      return users.value
    }
    const res = await $fetch<{ items: CrmUser[] }>('/api/crm/users', { query: { q: query, limit: 20 } })
    return res.items
  }

  /** Display name for a user id, or null when the id isn't in the cache. */
  function userName(id: string): string | null {
    return byId.value.get(id)?.name ?? null
  }

  return { users, byId, ensureUsers, searchUsers, userName }
}
