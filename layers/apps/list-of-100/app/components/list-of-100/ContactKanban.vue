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
  'change-faith': [id: string, faith: FaithStatus]
}>()

// Display order: Believer · Unknown · Non-believer (the multiplication-mindset
// left-to-right grouping — already-disciples on the left, the rest moving
// rightward).
const COLUMNS: { value: FaithStatus, label: string }[] = [
  { value: 'believer', label: 'Believer' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'non_believer', label: 'Non-believer' }
]

const grouped = computed(() => {
  const out = new Map<FaithStatus, ListContact[]>()
  for (const col of COLUMNS) out.set(col.value, [])
  for (const c of props.contacts) {
    out.get(c.faith_status)?.push(c)
  }
  return out
})

const relLabel = (r: Relationship) => RELATIONSHIPS.find(x => x.value === r)?.label ?? r

const dragId = ref<string | null>(null)

function onDragStart(id: string, e: DragEvent) {
  dragId.value = id
  e.dataTransfer?.setData('text/plain', id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}
function onDrop(target: FaithStatus, e: DragEvent) {
  e.preventDefault()
  const id = dragId.value ?? e.dataTransfer?.getData('text/plain') ?? null
  dragId.value = null
  if (!id) return
  const contact = props.contacts.find(c => c.id === id)
  if (!contact || contact.faith_status === target) return
  emit('change-faith', id, target)
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div
      v-for="col in COLUMNS"
      :key="col.value"
      class="rounded-lg border border-(--ui-border) bg-(--ui-bg-muted) flex flex-col min-h-[200px]"
      @dragover="onDragOver"
      @drop="onDrop(col.value, $event)"
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
          class="rounded-md border border-(--ui-border) bg-(--ui-bg) p-3 cursor-grab active:cursor-grabbing hover:border-(--ui-border-accented) transition-colors"
          draggable="true"
          @dragstart="onDragStart(c.id, $event)"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <button
                type="button"
                class="font-medium text-sm truncate block text-left hover:text-(--ui-primary) hover:underline focus:outline-none focus-visible:underline"
                @click.stop="emit('edit', c)"
              >
                {{ c.name }}
              </button>
              <div class="text-xs text-(--ui-text-muted)">
                {{ relLabel(c.relationship) }}
              </div>
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
          <div class="mt-2 flex items-center gap-2 flex-wrap">
            <UBadge
              :label="`Contacted ${relativeTime(c.last_contacted_at)}`"
              color="info"
              variant="soft"
              size="xs"
              icon="i-lucide-message-circle"
            />
            <UBadge
              :label="`Prayed ${relativeTime(c.last_prayed_at)}`"
              color="success"
              variant="soft"
              size="xs"
              icon="i-lucide-hand-heart"
            />
          </div>
          <div class="mt-2 flex gap-1">
            <UButton
              icon="i-lucide-message-circle"
              variant="soft"
              color="info"
              size="xs"
              block
              @click.stop="emit('mark-contacted', c.id)"
            >
              Contacted
            </UButton>
            <UButton
              icon="i-lucide-hand-heart"
              variant="soft"
              color="success"
              size="xs"
              block
              @click.stop="emit('mark-prayed', c.id)"
            >
              Prayed
            </UButton>
          </div>
        </div>
        <div
          v-if="(grouped.get(col.value)?.length ?? 0) === 0"
          class="text-center text-xs text-(--ui-text-muted) py-6"
        >
          Drag contacts here.
        </div>
      </div>
    </div>
  </div>
</template>
