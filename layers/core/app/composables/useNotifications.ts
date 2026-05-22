// Reactive global notification feed shared by the top-bar bell and the AppRail
// badges. State lives in `useState` so every call site reads one source of
// truth, and a single module-level interval drives polling no matter how many
// components mount the composable.
//
// Polling is gated: in single-tenant mode it always runs; in multi-tenant mode
// it only runs when there's an active org (the feed endpoint 404s without one,
// e.g. on the org picker).

import { useActiveOrg } from '#tenant'

export interface NotificationActor {
  id: string
  display_name: string
  avatar: string
}

export interface Notification {
  id: string
  app_id: string
  title: string
  body: string | null
  icon: string
  link: string
  created_at: string
  read_at: string | null
  actor: NotificationActor | null
}

interface FeedResponse {
  notifications: Notification[]
  next_cursor: string | null
}

interface CountsResponse {
  total: number
  byApp: Record<string, number>
}

// Module-level so polling is a singleton across all mounts.
let interval: ReturnType<typeof setInterval> | null = null
let subscribers = 0

export function useNotifications() {
  const items = useState<Notification[]>('notifications:items', () => [])
  const unreadCount = useState<number>('notifications:unread', () => 0)
  const byApp = useState<Record<string, number>>('notifications:byApp', () => ({}))
  const nextCursor = useState<string | null>('notifications:cursor', () => null)
  const pending = useState<boolean>('notifications:pending', () => false)

  const tenancyOn = !!useRuntimeConfig().public.tenancy
  const { slug } = useActiveOrg()
  const enabled = computed(() => !tenancyOn || !!slug.value)

  async function refresh() {
    if (!enabled.value) {
      items.value = []
      unreadCount.value = 0
      byApp.value = {}
      nextCursor.value = null
      return
    }
    pending.value = true
    try {
      const [feed, counts] = await Promise.all([
        $fetch<FeedResponse>('/api/notifications'),
        $fetch<CountsResponse>('/api/notifications/unread-counts')
      ])
      items.value = feed.notifications
      nextCursor.value = feed.next_cursor
      unreadCount.value = counts.total
      byApp.value = counts.byApp
    } finally {
      pending.value = false
    }
  }

  async function loadMore() {
    if (!enabled.value || !nextCursor.value) return
    const feed = await $fetch<FeedResponse>('/api/notifications', {
      query: { cursor: nextCursor.value }
    })
    items.value = [...items.value, ...feed.notifications]
    nextCursor.value = feed.next_cursor
  }

  async function markRead(ids?: string[]) {
    if (ids && ids.length === 0) return
    await $fetch('/api/notifications/read', {
      method: 'POST',
      body: ids ? { ids } : { all: true }
    })
    await refresh()
  }

  // Re-fetch when the active org changes (multi-tenant org switch).
  watch(slug, () => refresh())

  function start() {
    refresh()
    subscribers++
    if (interval) return
    interval = setInterval(refresh, 30_000)
  }

  function stop() {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers === 0 && interval) {
      clearInterval(interval)
      interval = null
    }
  }

  return { items, unreadCount, byApp, nextCursor, pending, enabled, refresh, loadMore, markRead, start, stop }
}
