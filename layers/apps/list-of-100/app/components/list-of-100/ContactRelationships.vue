<script setup lang="ts">
import type { ListContact, FaithStatus, Relationship } from '../../utils/list-of-100-types'
import { FAITH_STATUSES, RELATIONSHIPS, relativeTime } from '../../utils/list-of-100-types'

const props = defineProps<{
  contacts: ListContact[]
}>()

const emit = defineEmits<{
  edit: [contact: ListContact]
  delete: [contact: ListContact]
  'mark-contacted': [id: string]
  'mark-prayed': [id: string]
}>()

const grouped = computed(() => {
  const out = new Map<Relationship, ListContact[]>()
  for (const r of RELATIONSHIPS) out.set(r.value, [])
  for (const c of props.contacts) {
    out.get(c.relationship)?.push(c)
  }
  return out
})

const faithLabel = (s: FaithStatus) => FAITH_STATUSES.find(f => f.value === s)?.label ?? s
const faithColor = (s: FaithStatus) => FAITH_STATUSES.find(f => f.value === s)?.color ?? 'neutral'
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
    <div
      v-for="col in RELATIONSHIPS"
      :key="col.value"
      class="rounded-lg border border-(--ui-border) bg-(--ui-bg-muted) flex flex-col min-h-[200px]"
    >
      <div class="px-3 py-2 border-b border-(--ui-border) flex items-center justify-between">
        <span class="text-sm font-medium">{{ col.label }}</span>
        <UBadge
          :label="grouped.get(col.value)?.length ?? 0"
          color="neutral"
          variant="soft"
          size="sm"
        />
      </div>
      <div class="p-2 flex-1 space-y-2">
        <div
          v-for="c in grouped.get(col.value)"
          :key="c.id"
          class="rounded-md border border-(--ui-border) bg-(--ui-bg) p-3"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <button
                type="button"
                class="font-medium text-sm truncate block text-left hover:text-(--ui-primary) hover:underline focus:outline-none focus-visible:underline"
                @click="emit('edit', c)"
              >
                {{ c.name }}
              </button>
              <UBadge
                :label="faithLabel(c.faith_status)"
                :color="faithColor(c.faith_status)"
                variant="soft"
                size="xs"
                class="mt-1"
              />
            </div>
            <UDropdownMenu
              :items="[[
                { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => emit('edit', c) },
                { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('delete', c) }
              ]]"
            >
              <UButton
                icon="i-lucide-more-horizontal"
                variant="ghost"
                color="neutral"
                size="xs"
                square
                aria-label="More actions"
              />
            </UDropdownMenu>
          </div>
          <div class="mt-2 flex gap-1">
            <UButton
              icon="i-lucide-message-circle"
              variant="soft"
              color="info"
              size="xs"
              block
              @click="emit('mark-contacted', c.id)"
            >
              {{ relativeTime(c.last_contacted_at) }}
            </UButton>
            <UButton
              icon="i-lucide-hand-heart"
              variant="soft"
              color="success"
              size="xs"
              block
              @click="emit('mark-prayed', c.id)"
            >
              {{ relativeTime(c.last_prayed_at) }}
            </UButton>
          </div>
        </div>
        <div
          v-if="(grouped.get(col.value)?.length ?? 0) === 0"
          class="text-center text-xs text-(--ui-text-muted) py-6"
        >
          No one yet.
        </div>
      </div>
    </div>
  </div>
</template>
