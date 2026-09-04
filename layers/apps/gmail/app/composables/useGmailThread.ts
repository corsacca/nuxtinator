// Detail-pane state for one thread: the thread payload, lazy body loads,
// and the triage actions.
import type { MaybeRefOrGetter } from 'vue'
import type { GmailAddressView } from '../utils/gmail-format'
import type { GmailThreadRow } from './useGmailThreads'

export interface GmailAttachmentView {
  index: number
  filename: string | null
  contentType: string
  size: number
  cid: string | null
  inline: boolean
}

export interface GmailMessageView {
  id: string
  folder: 'all' | 'trash' | 'spam'
  messageId: string | null
  fromName: string | null
  fromAddr: string | null
  to: GmailAddressView[]
  cc: GmailAddressView[]
  bcc: GmailAddressView[]
  replyTo: GmailAddressView[]
  subject: string | null
  snippet: string | null
  internalDate: string
  labels: string[]
  isUnread: boolean
  isStarred: boolean
  hasAttachments: boolean
  bodyFetched: boolean
  bodyHtml: string | null
  bodyText: string | null
  attachments: GmailAttachmentView[]
}

export interface GmailThreadDetail {
  thread: GmailThreadRow & { isImportant: boolean, hasSent: boolean, spamCount: number, trashCount: number }
  messages: GmailMessageView[]
}

export type GmailThreadAction
  = | 'archive' | 'move_to_inbox' | 'mark_read' | 'mark_unread' | 'star' | 'unstar'
    | 'trash' | 'untrash' | 'spam' | 'not_spam' | 'delete_forever'
    | 'add_label' | 'remove_label' | 'snooze' | 'unsnooze'

export function useGmailThread(threadId: MaybeRefOrGetter<string | null>) {
  const orgKey = useGmailOrgKey()
  const detail = ref<GmailThreadDetail | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)
  const bodyPending = ref<Set<string>>(new Set())

  let requestId = 0
  async function refresh(): Promise<void> {
    const id = toValue(threadId)
    const rid = ++requestId
    if (!id) {
      detail.value = null
      return
    }
    pending.value = true
    try {
      const res = await $fetch<GmailThreadDetail>(`/api/gmail/threads/${id}`)
      if (rid !== requestId) return
      detail.value = res
      error.value = null
    } catch (err) {
      if (rid !== requestId) return
      detail.value = null
      error.value = gmailErrorMessage(err) ?? 'Could not load thread'
    } finally {
      if (rid === requestId) pending.value = false
    }
  }

  async function loadBody(messageId: string): Promise<void> {
    const msg = detail.value?.messages.find(m => m.id === messageId)
    if (!msg || msg.bodyFetched || bodyPending.value.has(messageId)) return
    bodyPending.value = new Set([...bodyPending.value, messageId])
    try {
      const res = await $fetch<{ id: string, bodyHtml: string | null, bodyText: string | null, attachments: GmailAttachmentView[] }>(`/api/gmail/messages/${messageId}/body`)
      const current = detail.value?.messages.find(m => m.id === messageId)
      if (current) {
        current.bodyHtml = res.bodyHtml
        current.bodyText = res.bodyText
        current.attachments = res.attachments
        current.bodyFetched = true
        current.hasAttachments = res.attachments.some(a => !a.inline)
      }
    } finally {
      const next = new Set(bodyPending.value)
      next.delete(messageId)
      bodyPending.value = next
    }
  }

  async function act(action: GmailThreadAction, opts: { label?: string, wakeAt?: Date } = {}): Promise<void> {
    const id = toValue(threadId)
    if (!id) return
    await $fetch(`/api/gmail/threads/${id}/actions`, {
      method: 'POST',
      body: { action, label: opts.label, wakeAt: opts.wakeAt?.toISOString() }
    })
  }

  // Actions on a thread that is not the open one (list-row hover buttons).
  async function actOn(id: string, action: GmailThreadAction, opts: { label?: string, wakeAt?: Date } = {}): Promise<void> {
    await $fetch(`/api/gmail/threads/${id}/actions`, {
      method: 'POST',
      body: { action, label: opts.label, wakeAt: opts.wakeAt?.toISOString() }
    })
  }

  watch(() => [toValue(threadId), orgKey.value], () => refresh(), { immediate: true })

  return { detail, pending, error, bodyPending, refresh, loadBody, act, actOn }
}
