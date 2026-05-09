<script setup lang="ts">
import type { KanbanCardModel } from './types'
import { isCardOverdue, priorityDotColor, postTypeBadge } from '../../composables/useCardUtils'

const props = withDefaults(
  defineProps<{
    card: KanbanCardModel
    columnName?: string
    gridIndex?: number
  }>(),
  {
    columnName: '',
    gridIndex: 0
  }
)

const emit = defineEmits<{
  click: [card: KanbanCardModel]
  contextmenu: [payload: { card: KanbanCardModel; x: number; y: number }]
  dragstart: [payload: { card: KanbanCardModel; event: DragEvent }]
  dragend: []
}>()

const badge = computed(() => postTypeBadge(props.card.post_type))

const priorityQual = computed<string | null>(() => {
  const pm = props.card.post_meta || {}
  const q = pm.priority_qualitative
  if (q) return String(q).toLowerCase()
  return props.card.priority ? String(props.card.priority).toLowerCase() : null
})

const priorityDotClass = computed(() => priorityDotColor(priorityQual.value))
const overdue = computed(() => isCardOverdue(props.card, props.columnName))
const showOverdueIcon = computed(() => overdue.value && !props.card.is_done)

const assigneeInitials = computed(() => {
  const a = props.card.assignee
  if (!a) return ''
  const trimmed = String(a).trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
})

const shortDueDate = computed(() => {
  if (!props.card.due_date) return ''
  const d = new Date(props.card.due_date)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
})

function handleClick() {
  emit('click', props.card)
}

function handleContextMenu(event: MouseEvent) {
  event.preventDefault()
  emit('contextmenu', { card: props.card, x: event.clientX, y: event.clientY })
}

function handleDragStart(event: DragEvent) {
  if (event.dataTransfer) {
    try {
      event.dataTransfer.setData('application/json', JSON.stringify(props.card))
    } catch {
      // parent handler receives the card anyway
    }
    event.dataTransfer.effectAllowed = 'move'
  }
  emit('dragstart', { card: props.card, event })
}

function handleDragEnd(event: DragEvent) {
  const target = event.currentTarget as HTMLElement | null
  target?.classList.remove('dragging')
  emit('dragend')
}
</script>

<template>
  <div
    class="relative rounded-md border bg-(--ui-bg-elevated) shadow-sm cursor-grab select-none
           transition-shadow duration-100
           w-full min-h-[84px] p-2 pr-7
           hover:shadow-md hover:border-(--ui-primary)"
    :class="overdue ? 'border-red-500' : 'border-(--ui-border)'"
    draggable="true"
    :title="card.title || '(Untitled)'"
    @click="handleClick"
    @contextmenu.prevent="handleContextMenu"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <span
      v-if="showOverdueIcon"
      class="absolute top-1 left-1 text-red-500 text-[10px] leading-none"
      title="Overdue"
      aria-label="Overdue"
    >⚠️</span>

    <div
      class="absolute top-1 right-1 w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center"
      :class="[badge.bg, badge.fg]"
      :title="card.post_type"
    >
      {{ badge.letter }}
    </div>

    <h4
      class="text-xs font-medium line-clamp-2 leading-snug"
      :class="{ 'pl-4': showOverdueIcon }"
      :title="card.title || '(Untitled)'"
    >
      {{ card.title || '(Untitled)' }}
    </h4>

    <div class="mt-1.5 flex items-center gap-2 text-[11px] text-(--ui-text-muted)">
      <span
        v-if="assigneeInitials"
        class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-(--ui-bg-accented) text-[9px] font-semibold text-(--ui-text) shrink-0"
        :title="card.assignee || ''"
      >
        {{ assigneeInitials }}
      </span>

      <span
        v-if="card.due_date"
        class="inline-flex items-center gap-0.5 shrink-0"
        :class="{ 'text-red-500 font-semibold': overdue }"
        :title="card.due_date"
      >
        <UIcon :name="overdue ? 'i-lucide-triangle-alert' : 'i-lucide-calendar'" class="w-3 h-3" />
        <span>{{ shortDueDate }}</span>
      </span>

      <span
        v-if="priorityQual && priorityDotClass"
        class="inline-block w-2 h-2 rounded-full shrink-0"
        :class="[
          priorityDotClass,
          (priorityQual === 'highest' || priorityQual === 'critical') ? 'priority-pulse' : ''
        ]"
        :title="`${priorityQual.charAt(0).toUpperCase() + priorityQual.slice(1)} priority`"
      />

      <span
        v-if="card.is_done"
        class="ml-auto text-green-500 font-bold"
        title="Done"
        aria-label="Done"
      >✓</span>
    </div>
  </div>
</template>

<style scoped>
@keyframes flash-red {
  0%, 100% {
    background-color: rgb(220 38 38);
    opacity: 1;
  }
  50% {
    background-color: rgb(239 68 68);
    opacity: 0.6;
  }
}

.priority-pulse {
  animation: flash-red 2s ease-in-out infinite;
}
</style>
