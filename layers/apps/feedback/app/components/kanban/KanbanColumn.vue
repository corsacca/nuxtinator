<script setup lang="ts">
import type { KanbanColumnModel } from './types'

const props = defineProps<{
  column: KanbanColumnModel
  cardCount: number
  scope?: string
}>()

const emit = defineEmits<{
  renameColumn: [payload: { id: string; name: string }]
  updateWip: [payload: { id: string; wip_limit: number | null }]
  toggleColumn: []
}>()

const toast = useToast()
const { isColumnExpanded, toggleColumn } = useColumnCollapse()

const MANDATORY_NAMES = ['BACKLOG', 'DONE'] as const
const isMandatory = computed(() => MANDATORY_NAMES.includes(props.column.name as typeof MANDATORY_NAMES[number]))

const isExpanded = computed(() => {
  if (!props.scope) return true
  return isColumnExpanded(props.scope, props.column.id).value
})

const wipExceeded = computed(() => {
  return props.column.wip_limit !== null
    && props.column.wip_limit !== undefined
    && props.cardCount >= props.column.wip_limit
})

const wipDisplay = computed(() => {
  return props.column.wip_limit
    ? `${props.cardCount}/${props.column.wip_limit}`
    : String(props.cardCount)
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

const isEditingWip = ref(false)
const wipInput = ref<number | null>(props.column.wip_limit)
const wipInputEl = ref<HTMLInputElement | null>(null)

function handleWipDblClick() {
  wipInput.value = props.column.wip_limit
  isEditingWip.value = true
  nextTick(() => {
    wipInputEl.value?.focus()
    wipInputEl.value?.select()
  })
}

function commitWip() {
  const raw = wipInput.value
  let next: number | null
  if (raw === null || raw === undefined || (typeof raw === 'string' && String(raw).trim() === '')) {
    next = null
  } else {
    const n = Number(raw)
    next = Number.isFinite(n) && n > 0 ? Math.floor(n) : null
  }
  if (next !== props.column.wip_limit) {
    emit('updateWip', { id: props.column.id, wip_limit: next })
  }
  isEditingWip.value = false
}

function cancelWip() {
  wipInput.value = props.column.wip_limit
  isEditingWip.value = false
}

function handleWipKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitWip()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelWip()
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
watch(() => props.column.wip_limit, (val) => {
  if (!isEditingWip.value) wipInput.value = val
})
</script>

<template>
  <div
    class="kanban-column-header px-3 py-2 border-b border-(--ui-border) bg-(--ui-bg-elevated) flex items-center gap-2"
    :class="{ 'wip-exceeded border-red-500 border-b-2': wipExceeded }"
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

    <div class="flex items-center gap-1 shrink-0">
      <span class="text-[10px] text-(--ui-text-muted) uppercase">WIP</span>
      <input
        v-if="isEditingWip"
        ref="wipInputEl"
        v-model.number="wipInput"
        type="number"
        min="0"
        class="w-14 px-1 py-0.5 text-xs bg-(--ui-bg) border border-(--ui-border) rounded outline-none focus:ring-1 focus:ring-(--ui-primary)"
        @blur="commitWip"
        @keydown="handleWipKeydown"
      >
      <button
        v-else
        type="button"
        class="text-xs px-2 py-0.5 rounded border select-none"
        :class="wipExceeded
          ? 'wip-exceeded animate-pulse text-red-500 border-red-500 bg-red-500/10'
          : 'bg-(--ui-bg-accented) text-(--ui-text-muted) border-(--ui-border)'"
        title="Double-click to edit WIP limit (empty to clear)"
        @dblclick="handleWipDblClick"
      >
        {{ wipDisplay }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.wip-exceeded {
  /* Hook for downstream styles / tests targeting the exceeded state. */
}
</style>
