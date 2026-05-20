// Reactive items list for one conversation, with cursor pagination + 30s polling.

export interface MessageItem {
  id: string
  kind: 'markdown' | 'image' | 'file'
  body_md: string | null
  storage_key: string | null
  filename: string | null
  mime: string | null
  size_bytes: string | null
  url: string | null
  created_at: string
  edited_at: string | null
  author: { id: string, display_name: string, avatar: string }
  starred: boolean
  my_tags: string[]
  comment_count: number
  reactions: Array<{ emoji: string, count: number, mine: boolean }>
}

interface ItemsResponse {
  items: MessageItem[]
  next_cursor: string | null
}

export function useConversationItems(conversationId: Ref<string | null>) {
  const items = ref<MessageItem[]>([])
  const nextCursor = ref<string | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  // Shared sidebar conversations state — refreshed right after the read pointer
  // moves so the unread badge clears immediately instead of waiting for its poll.
  const conversations = useMessagesConversations()

  async function refresh() {
    if (!conversationId.value) return
    pending.value = true
    error.value = null
    try {
      const res = await $fetch<ItemsResponse>(`/api/messages/conversations/${conversationId.value}/items`)
      items.value = res.items
      nextCursor.value = res.next_cursor
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      pending.value = false
    }
  }

  async function loadMore() {
    if (!conversationId.value || !nextCursor.value) return
    try {
      const res = await $fetch<ItemsResponse>(
        `/api/messages/conversations/${conversationId.value}/items`,
        { query: { cursor: nextCursor.value } }
      )
      items.value = items.value.concat(res.items)
      nextCursor.value = res.next_cursor
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function postMarkdown(bodyMd: string) {
    if (!conversationId.value) return
    await $fetch(`/api/messages/conversations/${conversationId.value}/items`, {
      method: 'POST',
      body: { kind: 'markdown', body_md: bodyMd }
    })
    await markRead()
    await refresh()
  }

  async function postUpload(upload: { storage_key: string, filename: string, mime: string, size_bytes: number }, kind: 'image' | 'file') {
    if (!conversationId.value) return
    await $fetch(`/api/messages/conversations/${conversationId.value}/items`, {
      method: 'POST',
      body: { kind, upload }
    })
    await markRead()
    await refresh()
  }

  async function markRead() {
    if (!conversationId.value) return
    await $fetch(`/api/messages/conversations/${conversationId.value}/read`, { method: 'POST' })
    await conversations.refresh()
  }

  let interval: ReturnType<typeof setInterval> | null = null
  function start() {
    refresh()
    markRead()
    if (interval) return
    interval = setInterval(refresh, 30_000)
  }
  function stop() {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
  }

  watch(conversationId, () => {
    items.value = []
    nextCursor.value = null
    refresh()
    markRead()
  })

  return { items, nextCursor, pending, error, refresh, loadMore, postMarkdown, postUpload, markRead, start, stop }
}
