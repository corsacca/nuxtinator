<script setup lang="ts">
// The right pane: thread toolbar, subject and labels, the message stack
// (latest and unread messages open by default), and reply entry points.
import type { GmailThreadDetail, GmailMessageView, GmailThreadAction } from '../../composables/useGmailThread'

const props = defineProps<{
  detail: GmailThreadDetail | null
  pending: boolean
  error: string | null
  bodyPending: Set<string>
  selfAddresses: Set<string>
  labels: string[]
  accountEmail: string | null
  showAccount: boolean
}>()

const emit = defineEmits<{
  action: [action: GmailThreadAction, opts?: { label?: string, wakeAt?: Date }]
  reply: [message: GmailMessageView, mode: 'reply' | 'reply_all' | 'forward']
  loadBody: [messageId: string]
  createLabel: [name: string]
}>()

const expanded = ref<Set<string>>(new Set())

watch(() => props.detail?.thread.id, () => {
  const msgs = props.detail?.messages ?? []
  const open = new Set<string>()
  for (const m of msgs) if (m.isUnread) open.add(m.id)
  const last = msgs[msgs.length - 1]
  if (last) open.add(last.id)
  if (msgs.length === 1 && msgs[0]) open.add(msgs[0].id)
  expanded.value = open
  for (const id of open) emit('loadBody', id)
}, { immediate: true })

function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else {
    next.add(id)
    emit('loadBody', id)
  }
  expanded.value = next
}

const thread = computed(() => props.detail?.thread ?? null)
const inTrash = computed(() => !!thread.value && thread.value.trashCount > 0 && thread.value.trashCount >= thread.value.messageCount)
const inSpam = computed(() => !!thread.value && thread.value.spamCount > 0)
const lastMessage = computed(() => {
  const msgs = props.detail?.messages ?? []
  return msgs.length ? msgs[msgs.length - 1]! : null
})
</script>

<template>
  <section class="flex-1 flex flex-col min-w-0 min-h-0">
    <div
      v-if="!detail && !pending && !error"
      class="flex-1 flex items-center justify-center text-sm text-(--ui-text-dimmed)"
    >
      Select a conversation
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      :title="error"
      class="m-4"
    />
    <template v-else-if="detail && thread">
      <div class="flex items-center gap-1 px-3 py-2 border-b border-(--ui-border)">
        <template v-if="inSpam">
          <UButton
            label="Not spam"
            icon="i-lucide-shield-check"
            size="xs"
            color="neutral"
            variant="outline"
            @click="emit('action', 'not_spam')"
          />
          <UButton
            label="Delete forever"
            icon="i-lucide-trash-2"
            size="xs"
            color="error"
            variant="ghost"
            @click="emit('action', 'delete_forever')"
          />
        </template>
        <template v-else-if="inTrash">
          <UButton
            label="Move to inbox"
            icon="i-lucide-inbox"
            size="xs"
            color="neutral"
            variant="outline"
            @click="emit('action', 'untrash')"
          />
          <UButton
            label="Delete forever"
            icon="i-lucide-trash-2"
            size="xs"
            color="error"
            variant="ghost"
            @click="emit('action', 'delete_forever')"
          />
        </template>
        <template v-else>
          <UButton
            v-if="thread.inInbox"
            icon="i-lucide-archive"
            size="xs"
            color="neutral"
            variant="ghost"
            square
            title="Archive"
            @click="emit('action', 'archive')"
          />
          <UButton
            v-else
            icon="i-lucide-inbox"
            size="xs"
            color="neutral"
            variant="ghost"
            square
            title="Move to inbox"
            @click="emit('action', 'move_to_inbox')"
          />
          <UButton
            icon="i-lucide-shield-alert"
            size="xs"
            color="neutral"
            variant="ghost"
            square
            title="Report spam"
            @click="emit('action', 'spam')"
          />
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            color="neutral"
            variant="ghost"
            square
            title="Delete"
            @click="emit('action', 'trash')"
          />
          <USeparator
            orientation="vertical"
            class="h-5 mx-1"
          />
          <UButton
            v-if="thread.snoozedUntil"
            icon="i-lucide-alarm-clock-off"
            :label="gmailSnoozeLabel(thread.snoozedUntil)"
            size="xs"
            color="warning"
            variant="subtle"
            title="Unsnooze"
            @click="emit('action', 'unsnooze')"
          />
          <GmailSnoozeMenu
            v-else
            @snooze="at => emit('action', 'snooze', { wakeAt: at })"
          />
          <GmailLabelMenu
            :labels="labels"
            :applied="thread.labels"
            @toggle="(label, on) => emit('action', on ? 'add_label' : 'remove_label', { label })"
            @create="name => emit('createLabel', name)"
          />
          <UButton
            icon="i-lucide-mail"
            size="xs"
            color="neutral"
            variant="ghost"
            square
            title="Mark as unread"
            @click="emit('action', 'mark_unread')"
          />
          <UButton
            :icon="thread.isStarred ? 'i-lucide-star' : 'i-lucide-star'"
            size="xs"
            :color="thread.isStarred ? 'warning' : 'neutral'"
            variant="ghost"
            square
            :title="thread.isStarred ? 'Unstar' : 'Star'"
            @click="emit('action', thread.isStarred ? 'unstar' : 'star')"
          />
        </template>
        <span
          v-if="showAccount && accountEmail"
          class="ml-auto text-xs text-(--ui-text-dimmed) truncate"
        >{{ accountEmail }}</span>
      </div>

      <div class="flex-1 overflow-y-auto min-h-0">
        <div class="px-4 pt-4 pb-2">
          <h2 class="text-lg font-semibold text-(--ui-text-highlighted) break-words">
            {{ thread.subject || '(no subject)' }}
          </h2>
          <div
            v-if="thread.labels.length || thread.snoozedUntil || thread.wokenAt"
            class="mt-1 flex flex-wrap items-center gap-1"
          >
            <UBadge
              v-for="l in thread.labels"
              :key="l"
              :label="l"
              size="sm"
              variant="subtle"
              color="neutral"
            />
            <UBadge
              v-if="thread.snoozedUntil"
              :label="`Snoozed until ${gmailSnoozeLabel(thread.snoozedUntil)}`"
              size="sm"
              variant="subtle"
              color="warning"
              icon="i-lucide-clock"
            />
            <UBadge
              v-else-if="thread.wokenAt"
              label="Back from snooze"
              size="sm"
              variant="subtle"
              color="info"
              icon="i-lucide-alarm-clock"
            />
          </div>
        </div>
        <div class="px-4 pb-4 space-y-2">
          <GmailMessageCard
            v-for="m in detail.messages"
            :key="m.id"
            :message="m"
            :expanded="expanded.has(m.id)"
            :body-pending="bodyPending.has(m.id)"
            :self-addresses="selfAddresses"
            @toggle="toggle(m.id)"
            @reply="mode => emit('reply', m, mode)"
          />
        </div>
      </div>

      <div
        v-if="lastMessage && !inSpam && !inTrash"
        class="px-4 py-3 border-t border-(--ui-border) flex items-center gap-2"
      >
        <UButton
          label="Reply"
          icon="i-lucide-reply"
          size="sm"
          color="neutral"
          variant="outline"
          @click="emit('reply', lastMessage, 'reply')"
        />
        <UButton
          label="Reply all"
          icon="i-lucide-reply-all"
          size="sm"
          color="neutral"
          variant="ghost"
          @click="emit('reply', lastMessage, 'reply_all')"
        />
        <UButton
          label="Forward"
          icon="i-lucide-forward"
          size="sm"
          color="neutral"
          variant="ghost"
          @click="emit('reply', lastMessage, 'forward')"
        />
      </div>
    </template>
  </section>
</template>
