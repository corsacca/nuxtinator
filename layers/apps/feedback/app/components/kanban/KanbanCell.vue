<script setup lang="ts">
import KanbanCard from './KanbanCard.vue'
import type { KanbanCardModel, KanbanColumnModel, KanbanSwimlaneModel, KanbanProjectModel } from './types'
import { sortCardsByPriority } from '../../composables/useCardUtils'

const props = defineProps<{
  column: KanbanColumnModel
  swimlane: KanbanSwimlaneModel
  project: KanbanProjectModel
  cards: KanbanCardModel[]
  scope?: string
  columnCardCount?: number
  swimlaneFilterIds?: string[]
  heightPx?: number
}>()

const emit = defineEmits<{
  addCard: [payload: { columnId: string; swimlaneId: string; projectId: string }]
  cardClick: [card: KanbanCardModel]
  cardContextMenu: [payload: { card: KanbanCardModel; x: number; y: number }]
  cardDrop: [payload: {
    card: KanbanCardModel
    toColumnId: string
    toSwimlaneId: string
    toProjectId: string
  }]
}>()

const { isColumnExpanded, isCellExpanded, toggleCell } = useColumnCollapse()

const isDragOver = ref(false)

const columnExpanded = computed(() => {
  if (!props.scope) return true
  return isColumnExpanded(props.scope, props.column.id).value
})

const cellExpanded = computed(() => {
  if (!props.scope) return true
  return isCellExpanded(props.scope, props.column.id, props.swimlane.id).value
})

const isCollapsed = computed(() => {
  if (!columnExpanded.value) return true
  return !cellExpanded.value
})

function handleToggleCell() {
  if (!columnExpanded.value) return
  if (props.scope) {
    toggleCell(props.scope, props.column.id, props.swimlane.id)
  }
}

const cellCards = computed(() => {
  const laneSet = props.swimlaneFilterIds && props.swimlaneFilterIds.length > 0
    ? new Set(props.swimlaneFilterIds)
    : null
  const filtered = props.cards.filter(
    c => c.column_id === props.column.id
      && c.project_id === props.project.id
      && (laneSet ? laneSet.has(c.swimlane_id) : c.swimlane_id === props.swimlane.id)
  )
  return sortCardsByPriority(filtered)
})

const effectiveColumnCount = computed(() => {
  if (typeof props.columnCardCount === 'number') return props.columnCardCount
  return cellCards.value.length
})

const wipExceeded = computed(() => {
  const limit = props.column.wip_limit
  if (limit === null || limit === undefined) return false
  return effectiveColumnCount.value >= limit
})

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function handleDragLeave() {
  isDragOver.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  try {
    const raw = e.dataTransfer?.getData('application/json')
    if (!raw) return
    const data = JSON.parse(raw) as { card: KanbanCardModel; fromColumnId: string; fromSwimlaneId: string }
    if (data.fromColumnId === props.column.id && data.fromSwimlaneId === props.swimlane.id) {
      return
    }
    emit('cardDrop', {
      card: data.card,
      toColumnId: props.column.id,
      toSwimlaneId: props.swimlane.id,
      toProjectId: props.project.id
    })
  } catch (err) {
    console.error('Cell drop error', err)
  }
}

function handleCardDragStart({ card, event }: { card: KanbanCardModel; event: DragEvent }) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('application/json', JSON.stringify({
    card,
    fromColumnId: props.column.id,
    fromSwimlaneId: props.swimlane.id
  }))
  event.dataTransfer.effectAllowed = 'move'
}

function handleAdd() {
  emit('addCard', {
    columnId: props.column.id,
    swimlaneId: props.swimlane.id,
    projectId: props.project.id
  })
}

const APPROX_VISIBLE = 5
const hiddenCount = computed(() =>
  isCollapsed.value ? 0 : Math.max(0, cellCards.value.length - APPROX_VISIBLE)
)
</script>

<template>
  <div
    class="kanban-cell group relative p-1.5 border border-(--ui-border) bg-(--ui-bg) transition-colors
           flex flex-col gap-1 min-w-0"
    :class="{
      'drag-over bg-blue-500/10 ring-1 ring-blue-400 dark:bg-blue-950/40': isDragOver,
      'ring-1 ring-red-500 border-red-500': wipExceeded,
      'overflow-y-auto scrollbar-thin': !isCollapsed,
      'h-80': !isCollapsed && heightPx === undefined,
      'h-12 overflow-hidden': isCollapsed
    }"
    :style="!isCollapsed && heightPx !== undefined ? { height: `${heightPx}px` } : undefined"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="flex items-center justify-between shrink-0">
      <button
        type="button"
        class="flex items-center gap-1 text-xs text-(--ui-text-muted) px-1 rounded hover:bg-(--ui-bg-accented) disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!columnExpanded"
        :title="!columnExpanded
          ? 'Column is collapsed — use column header caret to expand'
          : (isCollapsed ? 'Expand cell' : 'Collapse cell')"
        @click="handleToggleCell"
      >
        <UIcon
          v-if="columnExpanded"
          :name="isCollapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
          class="w-3.5 h-3.5"
        />
        <span>{{ cellCards.length }}</span>
      </button>

      <UButton
        size="xs"
        variant="ghost"
        icon="i-lucide-plus"
        class="opacity-0 group-hover:opacity-100 transition-opacity"
        :class="{ 'opacity-100': cellCards.length === 0 }"
        :aria-label="`Add card to ${column.name}`"
        @click="handleAdd"
      />
    </div>

    <template v-if="!isCollapsed">
      <KanbanCard
        v-for="card in cellCards"
        :key="card.id"
        :card="card"
        :column-name="column.name"
        @click="(c) => emit('cardClick', c)"
        @contextmenu="(p) => emit('cardContextMenu', p)"
        @dragstart="handleCardDragStart"
      />

      <button
        type="button"
        class="w-full rounded border border-dashed border-(--ui-border) py-1 text-xs text-(--ui-text-muted)
               hover:text-(--ui-text) hover:bg-(--ui-bg-accented) transition-colors shrink-0 mt-0.5"
        @click.stop="handleAdd"
      >
        + Add card
      </button>

      <div
        v-if="hiddenCount > 0"
        class="shrink-0 text-center text-[11px] text-(--ui-text-muted) bg-(--ui-bg-accented) rounded px-1 py-0.5 mt-0.5 select-none"
      >
        Scroll for {{ hiddenCount }} more
      </div>
    </template>

    <div
      v-else
      class="text-center text-[11px] text-(--ui-text-muted) py-2 select-none"
    >
      {{ cellCards.length }} card{{ cellCards.length === 1 ? '' : 's' }}
    </div>

    <div
      v-if="wipExceeded"
      class="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl wip-flash pointer-events-none"
      aria-hidden="true"
    >
      WIP!
    </div>
  </div>
</template>

<style scoped>
.kanban-cell::-webkit-scrollbar {
  width: 4px;
}
.kanban-cell::-webkit-scrollbar-track {
  background: transparent;
}
.kanban-cell::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 2px;
}
.kanban-cell::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, currentColor 55%, transparent);
}

@keyframes wip-flash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.wip-flash {
  animation: wip-flash 1s ease-in-out infinite;
}
</style>
