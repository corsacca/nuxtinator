<script setup lang="ts">
import type { KanbanColumnModel } from './types'

const props = defineProps<{
  column: KanbanColumnModel
  cardCount: number
  scope?: string
}>()

const emit = defineEmits<{
  renameColumn: [payload: { id: string; name: string }]
  toggleColumn: []
}>()

const toast = useToast()
const { isColumnExpanded, toggleColumn } = useColumnCollapse()

const MANDATORY_NAMES = ['FEEDBACK INBOX', 'DOING', 'DONE', 'ARCHIVE'] as const
const isMandatory = computed(() => MANDATORY_NAMES.includes(props.column.name as typeof MANDATORY_NAMES[number]))

const isExpanded = computed(() => {
  if (!props.scope) return true
  return isColumnExpanded(props.scope, props.column.id).value
})

const isEditingName = ref(false)
const nameInput = ref(props.column.name)
const nameInputEl = ref<HTMLInputElement | null>(null)

function handleNameDblClick() {
  if (isMandatory.value) {
    toast.add({
      title: 'Cannot rename mandatory column',
      color: 'warning',
      duration: 2000
    })
    return
  }
  nameInput.value = props.column.name
  isEditingName.value = true
  nextTick(() => {
    nameInputEl.value?.focus()
    nameInputEl.value?.select()
  })
}

function commitName() {
  const next = nameInput.value.trim()
  if (next && next !== props.column.name) {
    emit('renameColumn', { id: props.column.id, name: next })
  }
  isEditingName.value = false
}

function cancelName() {
  nameInput.value = props.column.name
  isEditingName.value = false
}

function handleNameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitName()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelName()
  }
}

function handleToggleColumn() {
  if (props.scope) {
    toggleColumn(props.scope, props.column.id)
  }
  emit('toggleColumn')
}

watch(() => props.column.name, (val) => {
  if (!isEditingName.value) nameInput.value = val
})
</script>

<template>
  <div
    class="kanban-column-header px-3 py-2 border-b border-(--ui-border) bg-(--ui-bg-elevated) flex items-center gap-2"
  >
    <button
      type="button"
      class="flex items-center justify-center w-5 h-5 rounded hover:bg-(--ui-bg-accented) text-(--ui-text-muted) shrink-0"
      :title="isExpanded ? 'Collapse all cells in column' : 'Expand all cells in column'"
      :aria-label="isExpanded ? 'Collapse column' : 'Expand column'"
      @click="handleToggleColumn"
    >
      <UIcon
        :name="isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="w-4 h-4"
      />
    </button>

    <div class="flex-1 min-w-0">
      <input
        v-if="isEditingName"
        ref="nameInputEl"
        v-model="nameInput"
        type="text"
        class="w-full px-1 py-0.5 text-sm font-semibold uppercase tracking-wide bg-(--ui-bg) border border-(--ui-border) rounded outline-none focus:ring-1 focus:ring-(--ui-primary)"
        @blur="commitName"
        @keydown="handleNameKeydown"
      >
      <h3
        v-else
        class="font-semibold text-sm uppercase tracking-wide truncate select-none"
        :title="isMandatory ? 'Mandatory column - cannot rename' : 'Double-click to rename'"
        @dblclick="handleNameDblClick"
      >
        {{ column.name }}
      </h3>
    </div>

    <div class="flex items-center shrink-0">
      <span
        class="text-xs px-2 py-0.5 rounded border bg-(--ui-bg-accented) text-(--ui-text-muted) border-(--ui-border) select-none"
        :title="`${cardCount} card${cardCount === 1 ? '' : 's'}`"
      >
        {{ cardCount }}
      </span>
    </div>
  </div>
</template>
