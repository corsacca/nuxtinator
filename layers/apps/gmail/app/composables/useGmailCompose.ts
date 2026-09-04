// Composer state: one draft at a time, autosaved on a debounce, queued for
// send behind the undo window, and undone from the toast while still queued.
import type { GmailAddressView } from '../utils/gmail-format'
import type { GmailMessageView, GmailThreadDetail } from './useGmailThread'

export type GmailComposeMode = 'new' | 'reply' | 'reply_all' | 'forward'

export interface GmailDraft {
  id: string
  accountId: string
  mode: string
  threadId: string | null
  replyToMessageId: string | null
  to: GmailAddressView[]
  cc: GmailAddressView[]
  bcc: GmailAddressView[]
  subject: string | null
  bodyHtml: string | null
  attachments: { id: string, filename: string, contentType: string, size: number }[]
  status: string
  sendAfter: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface GmailComposeSeed {
  mode: GmailComposeMode
  accountId: string
  threadId?: string | null
  replyToMessageId?: string | null
  to?: GmailAddressView[]
  cc?: GmailAddressView[]
  bcc?: GmailAddressView[]
  subject?: string | null
  bodyHtml?: string | null
}

function withRe(subject: string | null | undefined, prefix: 'Re: ' | 'Fwd: '): string {
  const s = (subject ?? '').trim()
  if (!s) return prefix.trim()
  return new RegExp(`^${prefix.trim()}`, 'i').test(s) ? s : `${prefix}${s}`
}

// Recipients for a reply: answer the Reply-To (else From); reply-all adds the
// original To/Cc minus every address the user owns.
export function gmailReplySeed(
  detail: GmailThreadDetail,
  message: GmailMessageView,
  mode: 'reply' | 'reply_all' | 'forward',
  selfAddresses: Set<string>
): GmailComposeSeed {
  const isSelf = (a: GmailAddressView) => selfAddresses.has(a.address.toLowerCase())
  if (mode === 'forward') {
    return { mode, accountId: detail.thread.accountId, threadId: detail.thread.id, replyToMessageId: message.id, to: [], subject: withRe(message.subject ?? detail.thread.subject, 'Fwd: ') }
  }
  const primary = message.replyTo.length ? message.replyTo : (message.fromAddr ? [{ name: message.fromName, address: message.fromAddr }] : [])
  // Replying to your own sent message goes back to its recipients.
  const to = primary.every(isSelf) && message.to.length ? message.to : primary
  const seen = new Set(to.map(a => a.address.toLowerCase()))
  const cc: GmailAddressView[] = []
  if (mode === 'reply_all') {
    for (const a of [...message.to, ...message.cc]) {
      const key = a.address.toLowerCase()
      if (seen.has(key) || isSelf(a)) continue
      seen.add(key)
      cc.push(a)
    }
  }
  return {
    mode,
    accountId: detail.thread.accountId,
    threadId: detail.thread.id,
    replyToMessageId: message.id,
    to: to.filter(a => !isSelf(a) || to.length === 1),
    cc,
    subject: withRe(message.subject ?? detail.thread.subject, 'Re: ')
  }
}

export function useGmailCompose() {
  const toast = useToast()
  const open = ref(false)
  const draft = ref<GmailDraft | null>(null)
  const saving = ref(false)
  const sending = ref(false)
  const error = ref<string | null>(null)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingPatch: Record<string, unknown> = {}

  async function start(seed: GmailComposeSeed, signatureHtml?: string | null): Promise<void> {
    error.value = null
    const bodyHtml = seed.bodyHtml ?? (signatureHtml ? `<p></p><p>--<br>${signatureHtml}</p>` : '')
    const res = await $fetch<{ draft: GmailDraft }>('/api/gmail/drafts', {
      method: 'POST',
      body: { ...seed, bodyHtml }
    })
    draft.value = res.draft
    open.value = true
  }

  async function resume(existing: GmailDraft): Promise<void> {
    error.value = null
    draft.value = existing
    open.value = true
  }

  function queueSave(patch: Record<string, unknown>) {
    pendingPatch = { ...pendingPatch, ...patch }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void flush()
    }, 800)
  }

  async function flush(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const id = draft.value?.id
    if (!id || !Object.keys(pendingPatch).length) return
    const body = pendingPatch
    pendingPatch = {}
    saving.value = true
    try {
      const res = await $fetch<{ draft: GmailDraft }>(`/api/gmail/drafts/${id}`, { method: 'PATCH', body })
      if (draft.value?.id === id) draft.value = { ...res.draft, bodyHtml: draft.value.bodyHtml, subject: draft.value.subject, to: draft.value.to, cc: draft.value.cc, bcc: draft.value.bcc }
    } catch (err) {
      error.value = gmailErrorMessage(err) ?? 'Could not save draft'
    } finally {
      saving.value = false
    }
  }

  async function attach(file: File): Promise<void> {
    const id = draft.value?.id
    if (!id) return
    const form = new FormData()
    form.append('file', file)
    const res = await $fetch<{ attachment: GmailDraft['attachments'][number] }>(`/api/gmail/drafts/${id}/attachments`, { method: 'POST', body: form })
    if (draft.value?.id === id) draft.value.attachments = [...draft.value.attachments, res.attachment]
  }

  async function detach(attachmentId: string): Promise<void> {
    const id = draft.value?.id
    if (!id) return
    await $fetch(`/api/gmail/drafts/${id}/attachments/${attachmentId}`, { method: 'DELETE' })
    if (draft.value?.id === id) draft.value.attachments = draft.value.attachments.filter(a => a.id !== attachmentId)
  }

  async function discard(): Promise<void> {
    const id = draft.value?.id
    pendingPatch = {}
    if (saveTimer) clearTimeout(saveTimer)
    open.value = false
    draft.value = null
    if (id) await $fetch(`/api/gmail/drafts/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  // Close and keep the draft (it shows in the Drafts view).
  async function close(): Promise<void> {
    await flush()
    open.value = false
    draft.value = null
  }

  async function send(): Promise<boolean> {
    const id = draft.value?.id
    if (!id) return false
    sending.value = true
    error.value = null
    try {
      await flush()
      const res = await $fetch<{ queued: boolean, sendAfter: string }>(`/api/gmail/drafts/${id}/send`, { method: 'POST' })
      open.value = false
      draft.value = null
      const seconds = Math.max(0, Math.round((new Date(res.sendAfter).getTime() - Date.now()) / 1000))
      toast.add({
        title: 'Sending…',
        description: seconds > 0 ? `You have ${seconds}s to undo.` : undefined,
        icon: 'i-lucide-send',
        color: 'success',
        duration: Math.max(2000, seconds * 1000),
        actions: seconds > 0
          ? [{
              label: 'Undo',
              color: 'neutral',
              variant: 'outline',
              onClick: async () => {
                try {
                  await $fetch(`/api/gmail/drafts/${id}/unsend`, { method: 'POST' })
                  const back = await $fetch<{ draft: GmailDraft }>(`/api/gmail/drafts/${id}`)
                  await resume(back.draft)
                  toast.add({ title: 'Send cancelled', icon: 'i-lucide-undo-2', color: 'neutral' })
                } catch (err) {
                  toast.add({ title: 'Too late to undo', description: gmailErrorMessage(err), color: 'warning' })
                }
              }
            }]
          : []
      })
      return true
    } catch (err) {
      error.value = gmailErrorMessage(err) ?? 'Could not send'
      return false
    } finally {
      sending.value = false
    }
  }

  return { open, draft, saving, sending, error, start, resume, queueSave, flush, attach, detach, discard, close, send }
}

export function useGmailDrafts() {
  const drafts = ref<GmailDraft[]>([])
  const pending = ref(false)

  async function refresh(): Promise<void> {
    pending.value = true
    try {
      const res = await $fetch<{ drafts: GmailDraft[] }>('/api/gmail/drafts')
      drafts.value = res.drafts
    } finally {
      pending.value = false
    }
  }

  async function remove(id: string): Promise<void> {
    await $fetch(`/api/gmail/drafts/${id}`, { method: 'DELETE' })
    drafts.value = drafts.value.filter(d => d.id !== id)
  }

  return { drafts, pending, refresh, remove }
}
