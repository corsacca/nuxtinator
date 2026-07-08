// Detail-pane state for one conversation: the thread payload plus the triage
// and reply actions. Fetches re-run on org switches (org-keyed watch), and
// stale responses are dropped.

import type { MaybeRefOrGetter } from 'vue'

export interface InboxThreadMessage {
  id: string
  direction: 'inbound' | 'outbound'
  status: string
  senderName: string | null
  fromEmail: string | null
  fromName: string | null
  toEmail: string | null
  subject: string | null
  bodyHtml: string | null
  bodyStrippedHtml: string | null
  bodyText: string | null
  authenticated: boolean
  holdReason: string | null
  failedReason: string | null
  deliveredAt: string | null
  createdAt: string
  attachments: { id: string, filename: string | null, contentType: string | null, sizeBytes: number | null }[]
}

export interface InboxThreadDraft {
  id: string
  senderName: string | null
  fromEmail: string | null
  subject: string | null
  bodyHtml: string | null
  bodyText: string | null
  createdAt: string
  attachments: { id: string, filename: string | null, contentType: string | null, sizeBytes: number | null }[]
}

export interface InboxThread {
  conversation: {
    id: string
    subject: string | null
    status: string
    assignedUserId: string | null
    needsReview: boolean
    source: string
    counterpartyName: string | null
    lastMessageAt: string | null
    createdAt: string
  }
  channel: { value: string, verified: boolean, blocked: boolean } | null
  contacts: { id: string, name: string }[]
  capabilities: { canSend: boolean, canCreateContact: boolean }
  messages: InboxThreadMessage[]
  drafts: InboxThreadDraft[]
}

// An outbound message is delivered asynchronously by the send sweep, so a
// freshly-queued reply is still `queued` when the reply POST returns. Poll the
// thread while any outbound message sits in `queued`, so the UI reflects the
// queued→sent/delivered/failed transition without a manual refresh. Bounded so
// a genuinely stuck queue (sweep disabled) doesn't poll forever.
const THREAD_POLL_INTERVAL_MS = 2500
const THREAD_POLL_WINDOW_MS = 60_000

function threadHasPendingOutbound(t: InboxThread | null): boolean {
  return !!t?.messages.some(m => m.direction === 'outbound' && m.status === 'queued')
}

export function useInboxThread(conversationId: MaybeRefOrGetter<string | null>) {
  const orgKey = useCrmOrgKey()
  const thread = ref<InboxThread | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  let requestId = 0
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let pollUntil = 0

  function stopPoll(): void {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  // Re-arm the poll after each fetch: keep chasing while an outbound message is
  // still `queued` and the poll window is open; give up (and reset) once it
  // settles or the window elapses.
  function schedulePoll(): void {
    stopPoll()
    if (!threadHasPendingOutbound(thread.value)) {
      pollUntil = 0
      return
    }
    if (pollUntil === 0) pollUntil = Date.now() + THREAD_POLL_WINDOW_MS
    if (Date.now() > pollUntil) return
    pollTimer = setTimeout(() => { void refresh({ poll: true }) }, THREAD_POLL_INTERVAL_MS)
  }

  async function refresh(opts?: { poll?: boolean }): Promise<void> {
    const id = toValue(conversationId)
    if (!id) {
      stopPoll()
      thread.value = null
      return
    }
    const rid = ++requestId
    // A background poll must not flip the pane into a loading state.
    if (!opts?.poll) pending.value = true
    try {
      const res = await $fetch<InboxThread>(`/api/inbox/conversations/${id}`)
      if (rid !== requestId) return
      thread.value = res
      error.value = null
      schedulePoll()
    } catch (err) {
      if (rid !== requestId) return
      thread.value = null
      error.value = err instanceof Error ? err.message : 'Failed to load conversation'
      stopPoll()
    } finally {
      if (rid === requestId && !opts?.poll) pending.value = false
    }
  }

  watch([() => toValue(conversationId), orgKey], () => {
    pollUntil = 0
    stopPoll()
    refresh()
  }, { immediate: true })

  onScopeDispose(stopPoll)

  async function patch(body: { status?: string, assignedUserId?: string | null, needsReview?: boolean }) {
    const id = toValue(conversationId)
    if (!id) return
    // Widened to string: a template-literal URL narrows to the typed GET
    // route, which rejects other methods.
    const url: string = `/api/inbox/conversations/${id}`
    await $fetch(url, { method: 'PATCH', body })
    await refresh()
  }

  async function reply(body: string) {
    const id = toValue(conversationId)
    if (!id) return
    await $fetch(`/api/inbox/conversations/${id}/messages`, { method: 'POST', body: { body } })
    await refresh()
  }

  async function createContact(name: string) {
    const id = toValue(conversationId)
    if (!id) return
    const record = await $fetch<{ id: string }>(`/api/inbox/conversations/${id}/contact`, {
      method: 'POST',
      body: { name }
    })
    await refresh()
    return record
  }

  return { thread, pending, error, refresh, patch, reply, createContact }
}

export interface InboxAssignee {
  id: string
  displayName: string
  avatar: string | null
}

export function useInboxAssignees() {
  const orgKey = useCrmOrgKey()
  const users = ref<InboxAssignee[]>([])
  async function refresh() {
    try {
      const res = await $fetch<{ users: InboxAssignee[] }>('/api/inbox/assignees')
      users.value = res.users
    } catch {
      users.value = []
    }
  }
  watch(orgKey, () => refresh(), { immediate: true })
  return { users, refresh }
}
