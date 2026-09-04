// List + rail state for the unified inbox, bound to the URL query (view,
// account, label, q, gq) so views are shareable and survive reloads. The
// list polls while the tab is visible because the mirror is updated by
// server-side sessions, not by anything the browser does.
import type { GmailAddressView } from '../utils/gmail-format'

export const GMAIL_VIEW_KEYS = ['inbox', 'starred', 'snoozed', 'sent', 'drafts', 'spam', 'trash', 'all'] as const
export type GmailViewKey = typeof GMAIL_VIEW_KEYS[number]

export interface GmailThreadRow {
  id: string
  accountId: string
  accountEmail: string
  subject: string | null
  snippet: string | null
  participants: GmailAddressView[]
  messageCount: number
  unreadCount: number
  hasAttachments: boolean
  isStarred: boolean
  inInbox: boolean
  labels: string[]
  lastMessageAt: string | null
  sortAt: string
  snoozedUntil: string | null
  wokenAt: string | null
}

export interface GmailCounts {
  inboxUnread: number
  inboxTotal: number
  snoozed: number
  spamUnread: number
  drafts: number
  perAccount: { accountId: string, inboxUnread: number }[]
}

const POLL_MS = 20_000

export function useGmailThreads() {
  const route = useRoute()
  const router = useRouter()
  const orgKey = useGmailOrgKey()

  const items = ref<GmailThreadRow[]>([])
  const total = ref(0)
  const counts = ref<GmailCounts | null>(null)
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

  const view = computed<GmailViewKey>({
    get: () => {
      const raw = queryString('view')
      return (GMAIL_VIEW_KEYS as readonly string[]).includes(raw) ? raw as GmailViewKey : (queryString('label') ? 'all' : 'inbox')
    },
    // Picking a view clears an active label folder and any Gmail search.
    set: v => setQuery({ view: v === 'inbox' ? undefined : v, label: undefined, gq: undefined })
  })

  const label = computed<string>({
    get: () => queryString('label'),
    set: v => setQuery({ label: v || undefined, view: v ? 'all' : undefined, gq: undefined })
  })

  const account = computed<string>({
    get: () => queryString('account'),
    set: v => setQuery({ account: v || undefined })
  })

  const q = computed<string>({
    get: () => queryString('q'),
    set: v => setQuery({ q: v || undefined })
  })

  // Gmail-syntax search sent to Google on submit.
  const gq = computed<string>({
    get: () => queryString('gq'),
    set: v => setQuery({ gq: v || undefined, view: v ? 'all' : undefined, label: undefined })
  })

  const page = ref(0)
  const pageSize = 50

  let requestId = 0
  async function refresh(opts: { silent?: boolean } = {}): Promise<void> {
    const id = ++requestId
    if (!opts.silent) pending.value = true
    try {
      const params: Record<string, string> = { limit: String(pageSize), offset: String(page.value * pageSize) }
      if (view.value !== 'drafts') params.view = view.value
      if (account.value) params.account = account.value
      if (label.value) params.label = label.value
      if (q.value) params.q = q.value
      if (gq.value) params.gq = gq.value
      const [list, c] = await Promise.all([
        view.value === 'drafts'
          ? Promise.resolve({ items: [] as GmailThreadRow[], total: 0 })
          : $fetch<{ items: GmailThreadRow[], total: number }>('/api/gmail/threads', { params }),
        $fetch<{ counts: GmailCounts }>('/api/gmail/threads/counts')
      ])
      if (id !== requestId) return
      items.value = list.items
      total.value = list.total
      counts.value = c.counts
      error.value = null
    } catch (err) {
      if (id !== requestId) return
      error.value = gmailErrorMessage(err) ?? 'Could not load mail'
    } finally {
      if (id === requestId) pending.value = false
    }
  }

  // Remove a thread from the current list without a round trip (after
  // archive/trash/snooze from the inbox view).
  function drop(threadId: string) {
    const before = items.value.length
    items.value = items.value.filter(t => t.id !== threadId)
    if (items.value.length !== before) total.value = Math.max(0, total.value - 1)
  }

  function patch(threadId: string, changes: Partial<GmailThreadRow>) {
    items.value = items.value.map(t => (t.id === threadId ? { ...t, ...changes } : t))
  }

  watch([view, label, account, q, gq, orgKey], () => {
    page.value = 0
    refresh()
  })
  watch(page, () => refresh())

  let timer: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    refresh()
    timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh({ silent: true })
    }, POLL_MS)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
  })

  return { items, total, counts, pending, error, view, label, account, q, gq, page, pageSize, refresh, drop, patch }
}
