// Reactive conversations list with 30s polling.

interface ConversationsResponse {
  channels: Array<{
    id: string
    name: string | null
    description: string | null
    subscribed: boolean
    muted: boolean
    unread_count: number
  }>
  dms: Array<{
    id: string
    members: Array<{ id: string, display_name: string, avatar: string }>
    unread_count: number
  }>
}

export function useMessagesConversations() {
  const data = useState<ConversationsResponse>('messages:conversations', () => ({
    channels: [],
    dms: []
  }))
  const pending = useState<boolean>('messages:conversations:pending', () => false)
  const error = useState<string | null>('messages:conversations:error', () => null)

  async function refresh() {
    pending.value = true
    error.value = null
    try {
      const res = await $fetch<ConversationsResponse>('/api/messages/conversations')
      data.value = res
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      pending.value = false
    }
  }

  // Initial fetch + polling. Lifecycle handled by the consuming component.
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

  return { data, pending, error, refresh, start, stop }
}
