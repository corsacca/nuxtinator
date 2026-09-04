<script setup lang="ts">
// The Drafts view: open drafts, queued sends and failures, in place of the
// thread list.
import type { GmailDraft } from '../../composables/useGmailCompose'

defineProps<{ drafts: GmailDraft[], pending: boolean }>()
const emit = defineEmits<{ open: [draft: GmailDraft], remove: [id: string] }>()

function recipients(d: GmailDraft): string {
  const all = [...d.to, ...d.cc, ...d.bcc]
  return all.length ? all.map(a => a.name || a.address).join(', ') : '(no recipients)'
}
</script>

<template>
  <div class="w-[26rem] shrink-0 flex flex-col min-h-0 border-r border-(--ui-border)">
    <div class="px-3 py-2 border-b border-(--ui-border) flex items-center justify-between">
      <span class="text-sm font-medium text-(--ui-text-muted)">Drafts</span>
      <span class="text-xs text-(--ui-text-dimmed)">{{ drafts.length }}</span>
    </div>
    <div class="flex-1 overflow-y-auto min-h-0">
      <div
        v-if="!drafts.length && !pending"
        class="p-8 text-center text-sm text-(--ui-text-muted)"
      >
        No drafts.
      </div>
      <div
        v-for="d in drafts"
        :key="d.id"
        class="group flex items-center gap-2 px-3 py-2 border-b border-(--ui-border) cursor-pointer text-sm hover:bg-(--ui-bg-elevated)"
        @click="emit('open', d)"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-(--ui-text)">{{ recipients(d) }}</span>
            <UBadge
              v-if="d.status === 'queued'"
              label="Sending"
              size="sm"
              variant="subtle"
              color="info"
            />
            <UBadge
              v-else-if="d.status === 'failed'"
              label="Failed"
              size="sm"
              variant="subtle"
              color="error"
              :title="d.lastError ?? undefined"
            />
            <span class="ml-auto shrink-0 text-xs text-(--ui-text-dimmed)">{{ gmailListDate(d.updatedAt) }}</span>
          </div>
          <div class="truncate text-(--ui-text-muted)">
            {{ d.subject || '(no subject)' }}
          </div>
        </div>
        <UButton
          icon="i-lucide-trash-2"
          size="xs"
          color="neutral"
          variant="ghost"
          square
          class="opacity-0 group-hover:opacity-100"
          title="Discard"
          @click.stop="emit('remove', d.id)"
        />
      </div>
    </div>
  </div>
</template>
