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
}

export function useInboxThread(conversationId: MaybeRefOrGetter<string | null>) {
  const orgKey = useCrmOrgKey()
  const thread = ref<InboxThread | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  let requestId = 0
  async function refresh(): Promise<void> {
    const id = toValue(conversationId)
    if (!id) {
      thread.value = null
      return
    }
    const rid = ++requestId
    pending.value = true
    try {
      const res = await $fetch<InboxThread>(`/api/inbox/conversations/${id}`)
      if (rid !== requestId) return
      thread.value = res
      error.value = null
    } catch (err) {
      if (rid !== requestId) return
      thread.value = null
      error.value = err instanceof Error ? err.message : 'Failed to load conversation'
    } finally {
      if (rid === requestId) pending.value = false
    }
  }

  watch([() => toValue(conversationId), orgKey], () => refresh(), { immediate: true })

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
