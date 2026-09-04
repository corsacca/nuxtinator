<script setup lang="ts">
// One list row. Unread threads render bold; hover reveals archive, trash,
// snooze, and read-toggle so the list is workable without opening threads.
import type { GmailThreadRow } from '../../composables/useGmailThreads'
import type { GmailThreadAction } from '../../composables/useGmailThread'

const props = defineProps<{
  thread: GmailThreadRow
  selected: boolean
  color: string
  showAccount: boolean
  selfAddresses: Set<string>
  view: string
}>()

const emit = defineEmits<{
  select: [id: string]
  action: [id: string, action: GmailThreadAction, opts?: { wakeAt?: Date }]
}>()

const unread = computed(() => props.thread.unreadCount > 0)

const who = computed(() => {
  const names = props.thread.participants.map(p => gmailDisplayName(p, props.selfAddresses))
  const unique = [...new Set(names)]
  if (!unique.length) return '(no sender)'
  if (unique.length <= 3) return unique.join(', ')
  return `${unique.slice(0, 2).join(', ')} … ${unique[unique.length - 1]}`
})
</script>

<template>
  <div
    class="group relative flex items-center gap-2 px-3 py-2 border-b border-(--ui-border) cursor-pointer text-sm"
    :class="[
      selected ? 'bg-(--ui-bg-accented)' : 'hover:bg-(--ui-bg-elevated)',
      unread ? 'bg-(--ui-bg)' : 'bg-(--ui-bg-elevated)/40'
    ]"
    @click="emit('select', thread.id)"
  >
    <span
      v-if="showAccount"
      class="size-2 shrink-0 rounded-full"
      :style="{ backgroundColor: `var(--ui-${color})` }"
      :title="thread.accountEmail"
    />
    <UButton
      :icon="thread.isStarred ? 'i-lucide-star' : 'i-lucide-star'"
      size="xs"
      variant="ghost"
      :color="thread.isStarred ? 'warning' : 'neutral'"
      square
      :class="thread.isStarred ? '' : 'opacity-40 hover:opacity-100'"
      :title="thread.isStarred ? 'Unstar' : 'Star'"
      @click.stop="emit('action', thread.id, thread.isStarred ? 'unstar' : 'star')"
    />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span
          class="truncate"
          :class="unread ? 'font-semibold text-(--ui-text-highlighted)' : 'text-(--ui-text)'"
        >{{ who }}</span>
        <span
          v-if="thread.messageCount > 1"
          class="text-xs text-(--ui-text-dimmed) shrink-0"
        >{{ thread.messageCount }}</span>
        <span
          class="ml-auto shrink-0 text-xs"
          :class="unread ? 'font-semibold text-(--ui-text)' : 'text-(--ui-text-dimmed)'"
        >
          <UBadge
            v-if="thread.snoozedUntil"
            :label="gmailSnoozeLabel(thread.snoozedUntil)"
            size="sm"
            variant="subtle"
            color="warning"
            icon="i-lucide-clock"
          />
          <span
            v-else
            class="group-hover:hidden"
          >{{ gmailListDate(thread.sortAt) }}</span>
        </span>
      </div>
      <div class="flex items-center gap-1.5 min-w-0">
        <span
          class="truncate"
          :class="unread ? 'font-medium text-(--ui-text-highlighted)' : 'text-(--ui-text-muted)'"
        >{{ thread.subject || '(no subject)' }}</span>
        <span
          v-if="thread.snippet"
          class="truncate text-(--ui-text-dimmed)"
        >— {{ thread.snippet }}</span>
        <UIcon
          v-if="thread.hasAttachments"
          name="i-lucide-paperclip"
          class="size-3.5 shrink-0 text-(--ui-text-dimmed)"
        />
        <UBadge
          v-for="l in thread.labels.slice(0, 2)"
          :key="l"
          :label="l"
          size="sm"
          variant="subtle"
          color="neutral"
          class="shrink-0"
        />
      </div>
    </div>

    <div class="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-(--ui-bg-elevated) rounded-md px-1 shadow-sm">
      <UButton
        v-if="thread.inInbox && view !== 'trash' && view !== 'spam'"
        icon="i-lucide-archive"
        size="xs"
        color="neutral"
        variant="ghost"
        square
        title="Archive"
        @click.stop="emit('action', thread.id, 'archive')"
      />
      <UButton
        v-if="view !== 'trash'"
        icon="i-lucide-trash-2"
        size="xs"
        color="neutral"
        variant="ghost"
        square
        title="Delete"
        @click.stop="emit('action', thread.id, 'trash')"
      />
      <UButton
        :icon="unread ? 'i-lucide-mail-open' : 'i-lucide-mail'"
        size="xs"
        color="neutral"
        variant="ghost"
        square
        :title="unread ? 'Mark as read' : 'Mark as unread'"
        @click.stop="emit('action', thread.id, unread ? 'mark_read' : 'mark_unread')"
      />
      <UButton
        v-if="thread.snoozedUntil"
        icon="i-lucide-alarm-clock-off"
        size="xs"
        color="neutral"
        variant="ghost"
        square
        title="Unsnooze"
        @click.stop="emit('action', thread.id, 'unsnooze')"
      />
      <GmailSnoozeMenu
        v-else-if="view !== 'trash' && view !== 'spam'"
        @snooze="at => emit('action', thread.id, 'snooze', { wakeAt: at })"
      />
    </div>
  </div>
</template>
