<script setup lang="ts">
// The middle pane: search, status strip, conversation rows. Selection is
// route-driven — clicking a row navigates to /inbox/:id (org prefix
// preserved by the router guard via useCrmPath).
import type { InboxConversationListRow, InboxCounts, InboxScope } from '../../composables/useInboxConversations'

const props = defineProps<{
  items: InboxConversationListRow[]
  counts: InboxCounts | null
  pending: boolean
  scope: InboxScope
  selectedId: string | null
}>()

const status = defineModel<string>('status', { required: true })
const q = defineModel<string>('q', { required: true })

const emit = defineEmits<{ select: [id: string] }>()

const statusTabs = computed(() => [
  { key: 'open', label: 'Open', count: props.counts?.open },
  { key: 'pending', label: 'Pending', count: props.counts?.pending },
  { key: 'closed', label: 'Closed' },
  { key: 'spam', label: 'Spam' },
  { key: 'all', label: 'All' }
])
</script>

<template>
  <div class="w-full lg:w-96 shrink-0 flex flex-col min-h-0 border-r border-(--ui-border)">
    <div class="p-2 border-b border-(--ui-border) space-y-2">
      <UInput
        v-model="q"
        icon="i-lucide-search"
        placeholder="Search subject, name, email…"
        size="sm"
        class="w-full"
      />
      <div v-if="scope !== 'held'" class="flex gap-1 overflow-x-auto">
        <UButton
          v-for="tab in statusTabs"
          :key="tab.key"
          :label="tab.label"
          size="xs"
          :variant="status === tab.key ? 'solid' : 'ghost'"
          :color="status === tab.key ? 'primary' : 'neutral'"
          @click="status = tab.key"
        >
          <template #trailing>
            <UBadge v-if="tab.count" :label="tab.count" size="sm" variant="subtle" color="neutral" />
          </template>
        </UButton>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <UEmpty
        v-if="!pending && items.length === 0"
        icon="i-lucide-inbox"
        title="No conversations"
        description="Nothing matches this view."
        variant="naked"
        class="mt-10"
      />
      <button
        v-for="c in items"
        :key="c.id"
        type="button"
        class="w-full text-left px-3 py-2.5 border-b border-(--ui-border) transition-colors"
        :class="selectedId === c.id ? 'bg-(--ui-bg-accented)' : 'hover:bg-(--ui-bg-accented)/50'"
        @click="emit('select', c.id)"
      >
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm truncate flex-1 text-(--ui-text-highlighted)">
            {{ c.counterpartyName || c.channelValue }}
          </span>
          <span class="text-xs text-(--ui-text-dimmed) shrink-0">{{ inboxRelativeTime(c.lastMessageAt || c.createdAt) }}</span>
        </div>
        <div class="text-sm truncate text-(--ui-text-muted)">{{ c.subject || '(no subject)' }}</div>
        <div class="flex items-center gap-1.5 mt-1">
          <UBadge
            :label="INBOX_STATUS_META[c.status]?.label ?? c.status"
            :color="INBOX_STATUS_META[c.status]?.color ?? 'neutral'"
            size="sm"
            variant="subtle"
          />
          <UBadge v-if="c.needsReview" label="Review" color="warning" size="sm" variant="subtle" icon="i-lucide-shield-alert" />
          <UBadge v-if="c.messageCount === 0" label="No message" color="error" size="sm" variant="subtle" />
          <span v-if="c.assigneeName" class="text-xs text-(--ui-text-dimmed) truncate ml-auto">{{ c.assigneeName }}</span>
        </div>
        <p v-if="c.snippet" class="text-xs text-(--ui-text-dimmed) truncate mt-1">{{ c.snippet }}</p>
      </button>
    </div>
  </div>
</template>
