<script setup lang="ts">
interface MenuItem {
  label: string
  icon?: string
  danger?: boolean
  action: string
}

const props = defineProps<{
  open: boolean
  x: number
  y: number
  items: MenuItem[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [action: string]
}>()

const pendingConfirm = ref<string | null>(null)
const menuEl = ref<HTMLElement | null>(null)

const style = computed(() => {
  const minWidth = 160
  const x = typeof window !== 'undefined' && props.x + minWidth > window.innerWidth
    ? props.x - minWidth
    : props.x
  return {
    position: 'fixed' as const,
    top: `${props.y}px`,
    left: `${x}px`,
    zIndex: 50,
    minWidth: `${minWidth}px`
  }
})

function close() {
  pendingConfirm.value = null
  emit('update:open', false)
}

function handleItemClick(item: MenuItem) {
  if (item.danger) {
    if (pendingConfirm.value === item.action) {
      pendingConfirm.value = null
      emit('update:open', false)
      emit('select', item.action)
    } else {
      pendingConfirm.value = item.action
    }
    return
  }
  emit('update:open', false)
  emit('select', item.action)
}

function handleOutsideClick(e: MouseEvent) {
  if (menuEl.value && menuEl.value.contains(e.target as Node)) return
  close()
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(() => props.open, (val) => {
  if (val) {
    document.addEventListener('click', handleOutsideClick, { capture: true })
    document.addEventListener('keydown', handleEscape)
  } else {
    document.removeEventListener('click', handleOutsideClick, { capture: true })
    document.removeEventListener('keydown', handleEscape)
    pendingConfirm.value = null
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick, { capture: true })
  document.removeEventListener('keydown', handleEscape)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuEl"
      :style="style"
      class="bg-(--ui-bg-elevated) border border-(--ui-border) rounded shadow-lg py-1"
      @click.stop
    >
      <button
        v-for="item in items"
        :key="item.action"
        class="w-full flex items-center gap-2 py-1.5 px-3 text-sm text-left transition-colors"
        :class="[
          item.danger
            ? pendingConfirm === item.action
              ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 font-medium'
              : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950'
            : 'text-(--ui-text) hover:bg-(--ui-bg-accented)'
        ]"
        @click="handleItemClick(item)"
      >
        <span v-if="item.icon" :class="item.icon" class="w-4 h-4 shrink-0" />
        <span>{{
          item.danger && pendingConfirm === item.action
            ? 'Click again to confirm'
            : item.label
        }}</span>
      </button>
    </div>
  </Teleport>
</template>
