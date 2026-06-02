<script setup lang="ts">
// Fullscreen image viewer. Open via v-model:open. Scroll wheel or the +/-
// buttons zoom; double-click toggles zoom; drag pans when zoomed in. Escape,
// the ✕ button, or a backdrop click closes. Teleported to <body> so it escapes
// any clipped/positioned ancestor.

const props = defineProps<{
  open: boolean
  src: string
  alt?: string
}>()

const emit = defineEmits<{
  'update:open': [v: boolean]
}>()

const isOpen = computed({
  get: () => props.open,
  set: v => emit('update:open', v)
})

const MIN = 1
const MAX = 5
const STEP = 0.5

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)

function reset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

function clampScale(v: number): number {
  return Math.min(MAX, Math.max(MIN, v))
}

function setScale(v: number) {
  scale.value = clampScale(v)
  if (scale.value === 1) { tx.value = 0; ty.value = 0 }
}

function onWheel(e: WheelEvent) {
  // Scale proportionally so each notch feels consistent at any zoom level.
  setScale(scale.value - e.deltaY * 0.0015 * scale.value)
}

function toggleZoom() {
  if (scale.value > 1) reset()
  else scale.value = 2
}

// ── Drag-to-pan (only meaningful when zoomed in) ───────────────────────────
const dragging = ref(false)
let startX = 0, startY = 0, baseTx = 0, baseTy = 0

function onPointerDown(e: PointerEvent) {
  if (scale.value <= 1) return
  dragging.value = true
  startX = e.clientX
  startY = e.clientY
  baseTx = tx.value
  baseTy = ty.value
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  tx.value = baseTx + (e.clientX - startX)
  ty.value = baseTy + (e.clientY - startY)
}

function onPointerUp() {
  dragging.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') isOpen.value = false
}

// Reset transform on open, lock body scroll, and listen for Escape.
watch(isOpen, (v) => {
  if (!import.meta.client) return
  if (v) {
    reset()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
  } else {
    window.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
  }
})

onUnmounted(() => {
  if (!import.meta.client) return
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/90"
      @click.self="isOpen = false"
    >
      <!-- Controls -->
      <div class="absolute top-4 right-4 z-10 flex gap-2">
        <UButton
          icon="i-lucide-zoom-out"
          color="neutral"
          :disabled="scale <= MIN"
          aria-label="Zoom out"
          @click="setScale(scale - STEP)"
        />
        <UButton
          icon="i-lucide-zoom-in"
          color="neutral"
          :disabled="scale >= MAX"
          aria-label="Zoom in"
          @click="setScale(scale + STEP)"
        />
        <UButton
          icon="i-lucide-x"
          color="neutral"
          aria-label="Close"
          @click="isOpen = false"
        />
      </div>

      <img
        :src="src"
        :alt="alt"
        draggable="false"
        class="max-w-[95vw] max-h-[95vh] select-none"
        :class="[
          { 'transition-transform duration-150': !dragging },
          scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        ]"
        :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
        @click.stop
        @dblclick="toggleZoom"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      >
    </div>
  </Teleport>
</template>
