// List + rail state for the inbox, bound to the URL query (scope, status, q)
// so views are shareable and survive reloads. Org-keyed watchers: org
// switches are SPA navigation and reuse this page component, so every fetch
// watch includes the org key, never just the route params.

export interface InboxConversationListRow {
  id: string
  subject: string | null
  status: string
  assignedUserId: string | null
  assigneeName: string | null
  needsReview: boolean
  source: string
  counterpartyName: string | null
  channelValue: string
  messageCount: number
  snippet: string | null
  lastMessageAt: string | null
  lastMessageDirection: string | null
  createdAt: string
}

export interface InboxCounts {
  all: number
  unassigned: number
  mine: number
  held: number
  open: number
  pending: number
}

export type InboxScope = 'all' | 'unassigned' | 'mine' | 'held'

export function useInboxConversations() {
  const route = useRoute()
  const router = useRouter()
  const orgKey = useCrmOrgKey()

  const items = ref<InboxConversationListRow[]>([])
  const total = ref(0)
  const counts = ref<InboxCounts | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  function queryString(key: string): string {
    const raw = route.query[key]
    if (typeof raw === 'string') return raw
    if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
    return ''
  }

  function setQuery(patch: Record<string, string | undefined>) {
    const merged: Record<string, unknown> = { ...route.query, ...patch }
    const next = Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined && value !== '')
    )
    router.replace({ query: next as Record<string, string> })
  }

  const scope = computed<InboxScope>({
    get: () => {
      const raw = queryString('scope')
      return raw === 'unassigned' || raw === 'mine' || raw === 'held' ? raw : 'all'
    },
    set: v => setQuery({ scope: v === 'all' ? undefined : v })
  })

  const status = computed<string>({
    get: () => queryString('status') || 'open',
    set: v => setQuery({ status: v === 'open' ? undefined : v })
  })

  const q = computed<string>({
    get: () => queryString('q'),
    set: v => setQuery({ q: v || undefined })
  })

  let requestId = 0
  async function refresh(): Promise<void> {
    const id = ++requestId
    pending.value = true
    const statusParam = status.value === 'all' ? undefined : status.value
    const query: Record<string, unknown> = { limit: 50 }
    if (scope.value === 'held') {
      // The held folder is status-independent — it's the whole review queue.
      query.held = true
    } else {
      if (statusParam) query.status = statusParam
      if (scope.value === 'unassigned') query.unassigned = true
      if (scope.value === 'mine') query.mine = true
    }
    if (q.value) query.q = q.value
    try {
      const [list, badge] = await Promise.all([
        $fetch<{ items: InboxConversationListRow[], total: number }>('/api/inbox/conversations', { query }),
        $fetch<InboxCounts>('/api/inbox/conversations/counts', {
          query: { status: statusParam, scope: scope.value }
        })
      ])
      if (id !== requestId) return
      items.value = list.items
      total.value = list.total
      counts.value = badge
      error.value = null
    } catch (err) {
      if (id !== requestId) return
      error.value = err instanceof Error ? err.message : 'Failed to load conversations'
    } finally {
      if (id === requestId) pending.value = false
    }
  }

  let debounce: ReturnType<typeof setTimeout> | null = null
  watch([scope, status, orgKey], () => refresh(), { immediate: true })
  watch(q, () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => refresh(), 300)
  })

  return { items, total, counts, pending, error, scope, status, q, refresh }
}
