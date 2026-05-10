// Reactive notifications feed for the messages app.

interface Notification {
  id: string
  kind: 'mention' | 'dm' | 'comment' | 'reply'
  item_id: string | null
  comment_id: string | null
  conversation_id: string | null
  conversation_kind: 'channel' | 'dm' | null
  conversation_name: string | null
  created_at: string
  read_at: string | null
  excerpt: string
  actor: { id: string, display_name: string, avatar: string } | null
}

interface Response {
  notifications: Notification[]
  next_cursor: string | null
  unread_count: number
}

export function useMessagesNotifications() {
  const items = useState<Notification[]>('messages:notifications', () => [])
  const unreadCount = useState<number>('messages:notifications:unread', () => 0)
  const pending = ref(false)

  async function refresh() {
    pending.value = true
    try {
      const res = await $fetch<Response>('/api/messages/notifications')
      items.value = res.notifications
      unreadCount.value = res.unread_count
    } finally {
      pending.value = false
    }
  }

  async function markRead(ids?: string[]) {
    if (ids && ids.length === 0) return
    await $fetch('/api/messages/notifications/read', {
      method: 'POST',
      body: ids ? { ids } : { all: true }
    })
    await refresh()
  }

  let interval: ReturnType<typeof setInterval> | null = null
  function start() {
    refresh()
    if (interval) return
    interval = setInterval(refresh, 30_000)
  }
  function stop() {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
  }

  return { items, unreadCount, pending, refresh, markRead, start, stop }
}
