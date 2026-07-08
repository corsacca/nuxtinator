<script setup lang="ts">
// The detail pane: triage header (contact chips, assignee, status, review
// flag), the message thread, and the reply composer. Destructive status
// transitions (spam) confirm first — marking spam blocklists the sender and
// closes all their threads.
import type { InboxThread, InboxThreadDraft } from '../../composables/useInboxThread'
import type { InboxAssignee } from '../../composables/useInboxThread'

const props = defineProps<{
  thread: InboxThread
  assignees: InboxAssignee[]
  sending?: boolean
}>()

const emit = defineEmits<{
  patch: [body: { status?: string, assignedUserId?: string | null, needsReview?: boolean }]
  reply: [body: string, draftId?: string]
  saveDraft: [body: string]
  deleteDraft: [draftId: string]
  createContact: [name: string]
}>()

// The draft the composer is currently editing (null = a fresh reply). Owned by
// the parent so its save handler can write back the new id after creating one.
const currentDraftId = defineModel<string | null>('draftId', { default: null })

const crmPath = useCrmPath()

const replyBody = ref('')
const confirmSpam = ref(false)
const contactName = ref('')
const showCreateContact = ref(false)

watch(() => props.thread.conversation.id, () => {
  replyBody.value = ''
  currentDraftId.value = null
  showCreateContact.value = false
})

function draftPreview(d: InboxThreadDraft): string {
  const text = (d.bodyText || d.bodyHtml || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text ? (text.length > 28 ? text.slice(0, 28) + '…' : text) : 'Empty draft'
}

function loadDraft(d: InboxThreadDraft) {
  replyBody.value = d.bodyHtml || ''
  currentDraftId.value = d.id
}

function onSaveDraft() {
  if (props.sending) return
  emit('saveDraft', replyBody.value)
}

function onDeleteDraft(d: InboxThreadDraft) {
  emit('deleteDraft', d.id)
  if (currentDraftId.value === d.id) {
    replyBody.value = ''
    currentDraftId.value = null
  }
}

// reka-ui selects reject '' as an item value — the unassigned sentinel is a
// real string swapped back to null on change.
const UNASSIGNED = '__none__'
const assigneeItems = computed(() => [
  { label: 'Unassigned', value: UNASSIGNED },
  ...props.assignees.map(a => ({ label: a.displayName, value: a.id }))
])
const assigneeValue = computed({
  get: () => props.thread.conversation.assignedUserId ?? UNASSIGNED,
  set: (v: string) => emit('patch', { assignedUserId: v === UNASSIGNED ? null : v })
})

const statusItems = [
  { label: 'Open', value: 'open' },
  { label: 'Pending', value: 'pending' },
  { label: 'Closed', value: 'closed' },
  { label: 'Spam', value: 'spam' }
]
const statusValue = computed({
  get: () => props.thread.conversation.status,
  set: (v: string) => {
    if (v === 'spam') {
      confirmSpam.value = true
      return
    }
    emit('patch', { status: v })
  }
})

function submitReply() {
  if (props.sending) return
  const body = replyBody.value.trim()
  if (!body || body === '<p></p>') return
  emit('reply', replyBody.value, currentDraftId.value ?? undefined)
  replyBody.value = ''
  currentDraftId.value = null
}

function submitContact() {
  const name = contactName.value.trim()
  if (!name) return
  emit('createContact', name)
  showCreateContact.value = false
}
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0 min-h-0">
    <header class="px-4 py-3 border-b border-(--ui-border) space-y-2">
      <div class="flex items-center gap-2 min-w-0">
        <h2 class="font-semibold truncate flex-1 text-(--ui-text-highlighted)">
          {{ thread.conversation.subject || '(no subject)' }}
        </h2>
        <UButton
          v-if="thread.conversation.needsReview"
          label="Mark reviewed"
          icon="i-lucide-shield-check"
          size="xs"
          color="warning"
          variant="subtle"
          @click="emit('patch', { needsReview: false })"
        />
        <USelect v-model="statusValue" :items="statusItems" size="xs" class="w-28" />
        <USelect v-model="assigneeValue" :items="assigneeItems" size="xs" class="w-36" />
      </div>
      <div class="flex items-center gap-2 flex-wrap text-sm">
        <span class="text-(--ui-text-muted) truncate">{{ thread.channel?.value }}</span>
        <UTooltip v-if="thread.channel?.verified" text="Address ownership verified by authenticated inbound mail">
          <UBadge label="Verified" color="success" size="sm" variant="subtle" icon="i-lucide-badge-check" />
        </UTooltip>
        <UBadge v-if="thread.channel?.blocked" label="Blocked sender" color="error" size="sm" variant="subtle" />
        <template v-if="thread.contacts.length">
          <UButton
            v-for="contact in thread.contacts"
            :key="contact.id"
            :label="contact.name"
            icon="i-lucide-contact"
            size="xs"
            variant="subtle"
            color="primary"
            :to="crmPath(`/contacts/${contact.id}`)"
          />
        </template>
        <UButton
          v-else-if="thread.capabilities.canCreateContact"
          label="Create contact"
          icon="i-lucide-user-plus"
          size="xs"
          variant="outline"
          color="neutral"
          @click="contactName = thread.conversation.counterpartyName || ''; showCreateContact = true"
        />
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      <InboxMessageBubble v-for="m in thread.messages" :key="m.id" :message="m" />
    </div>

    <footer
      v-if="thread.capabilities.canSend && thread.conversation.status !== 'spam'"
      class="border-t border-(--ui-border) p-3 space-y-2"
    >
      <div v-if="thread.drafts.length" class="flex flex-wrap items-center gap-1.5">
        <span class="text-xs text-(--ui-text-muted)">Drafts:</span>
        <UButtonGroup v-for="d in thread.drafts" :key="d.id" size="xs">
          <UButton
            :label="draftPreview(d)"
            icon="i-lucide-file-pen-line"
            color="neutral"
            :variant="currentDraftId === d.id ? 'solid' : 'subtle'"
            @click="loadDraft(d)"
          />
          <UButton icon="i-lucide-x" color="neutral" variant="subtle" aria-label="Discard draft" @click="onDeleteDraft(d)" />
        </UButtonGroup>
      </div>
      <UEditor
        v-model="replyBody"
        content-type="html"
        placeholder="Write your reply…"
        :image="false"
        :mention="false"
        class="min-h-24 max-h-64 overflow-y-auto rounded-md border border-(--ui-border)"
      />
      <div class="flex justify-end gap-2">
        <UButton
          label="Save draft"
          icon="i-lucide-save"
          size="sm"
          color="neutral"
          variant="ghost"
          :disabled="props.sending"
          @click="onSaveDraft"
        />
        <UButton
          :label="currentDraftId ? 'Send draft' : 'Send'"
          icon="i-lucide-send"
          size="sm"
          :loading="props.sending"
          :disabled="props.sending"
          @click="submitReply"
        />
      </div>
    </footer>

    <UModal v-model:open="confirmSpam" title="Mark as spam?">
      <template #body>
        <p class="text-sm text-(--ui-text-muted)">
          This blocks <span class="font-medium">{{ thread.channel?.value }}</span> — every conversation from
          this sender closes as spam and future mail is filed there silently.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="Cancel" variant="ghost" color="neutral" @click="confirmSpam = false" />
          <UButton
            label="Block sender"
            color="error"
            @click="emit('patch', { status: 'spam' }); confirmSpam = false"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showCreateContact" title="Create contact">
      <template #body>
        <UFormField label="Name" required>
          <UInput v-model="contactName" placeholder="Contact name" class="w-full" autofocus @keydown.enter="submitContact" />
        </UFormField>
        <p class="text-xs text-(--ui-text-muted) mt-2">
          The contact is created with {{ thread.channel?.value }} as their primary email and linked to
          every conversation on that address.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="Cancel" variant="ghost" color="neutral" @click="showCreateContact = false" />
          <UButton label="Create" @click="submitContact" />
        </div>
      </template>
    </UModal>
  </div>
</template>
