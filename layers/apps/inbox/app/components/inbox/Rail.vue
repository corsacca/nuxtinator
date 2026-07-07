<script setup lang="ts">
// Scope folders: the held review-queue alarm on top, then All / Unassigned /
// Mine. Counts come with the list fetch so the rail always matches the list.
import type { InboxCounts, InboxScope } from '../../composables/useInboxConversations'

const props = defineProps<{
  counts: InboxCounts | null
}>()

const scope = defineModel<InboxScope>('scope', { required: true })

const folders = computed(() => [
  { key: 'held' as const, label: 'Needs review', icon: 'i-lucide-shield-alert', count: props.counts?.held ?? 0, alert: true },
  { key: 'all' as const, label: 'All', icon: 'i-lucide-inbox', count: props.counts?.all ?? 0 },
  { key: 'unassigned' as const, label: 'Unassigned', icon: 'i-lucide-user-x', count: props.counts?.unassigned ?? 0 },
  { key: 'mine' as const, label: 'Mine', icon: 'i-lucide-user-check', count: props.counts?.mine ?? 0 }
])
</script>

<template>
  <SidebarPanel title="Inbox" class="w-52 shrink-0 hidden lg:flex">
    <nav class="p-2 space-y-0.5">
      <button
        v-for="folder in folders"
        :key="folder.key"
        type="button"
        class="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left transition-colors"
        :class="scope === folder.key
          ? 'bg-(--ui-bg-accented) text-(--ui-text-highlighted)'
          : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented)/50'"
        @click="scope = folder.key"
      >
        <UIcon :name="folder.icon" class="size-4 shrink-0" />
        <span class="flex-1 truncate">{{ folder.label }}</span>
        <UBadge
          v-if="folder.count > 0"
          :label="folder.count"
          size="sm"
          variant="subtle"
          :color="folder.alert ? 'warning' : 'neutral'"
        />
      </button>
    </nav>
  </SidebarPanel>
</template>
