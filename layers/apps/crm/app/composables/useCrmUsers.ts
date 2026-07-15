// Org user directory for user_select fields: one shared fetch of the user
// picker endpoint, cached in useState so formatters, avatar cells, and
// pickers all resolve ids from the same copy. Every cache is keyed by the
// active org (useCrmOrgKey) — org switching is an SPA navigation, so an
// unkeyed copy would serve one org's directory inside another.

/** A user as served by GET /api/crm/users. */
export interface CrmUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

// In-flight request dedupe, per org. SSR is off, so plain module state is safe.
const usersPromises = new Map<string, Promise<void>>()

export function useCrmUsers() {
  const cache = useState<Record<string, CrmUser[]>>('crm:users', () => ({}))
  const orgKey = useCrmOrgKey()

  const users = computed(() => cache.value[orgKey.value] ?? [])
  const byId = computed(() => new Map(users.value.map(u => [u.id, u])))

  // The org is captured before the request and the response is stored under
  // it, so a fetch that resolves after an org switch can't pollute the new
  // org's slot.
  async function fetchUsers(key: string): Promise<void> {
    const res = await $fetch<{ items: CrmUser[] }>('/api/crm/users', { query: { limit: 50 } })
    cache.value = { ...cache.value, [key]: res.items }
  }

  /** Fetches the directory once per org; concurrent callers share the request. */
  function ensureUsers(): Promise<void> {
    const key = orgKey.value
    if (key in cache.value) return Promise.resolve()
    let inflight = usersPromises.get(key)
    if (!inflight) {
      inflight = fetchUsers(key).finally(() => {
        usersPromises.delete(key)
      })
      usersPromises.set(key, inflight)
    }
    return inflight
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
