<script setup lang="ts">
// Markdown doc editor body. Desktop: two columns (raw | live preview), each at
// its natural height — the textarea auto-grows to its content and the preview
// renders full height, so the page owns the single scrollbar (no inner panes,
// no scroll-syncing). Mobile: a Write/Preview toggle. Title, Save, and the
// Display/Edit switch live in the page header.

const props = defineProps<{
  bodyMd: string
}>()

const emit = defineEmits<{
  'update:bodyMd': [v: string]
}>()

// Mobile-only view toggle. On md+ both panes always show (split).
const mobileView = ref<'write' | 'preview'>('write')

const bodyModel = computed({
  get: () => props.bodyMd,
  set: v => emit('update:bodyMd', v)
})

// Auto-grow the textarea so it never scrolls internally — the page scrolls.
const textareaRef = ref<HTMLTextAreaElement | null>(null)
function resize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
watch(bodyModel, () => nextTick(resize))
watch(mobileView, () => nextTick(resize))
onMounted(() => nextTick(resize))
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Mobile view toggle -->
    <div class="flex md:hidden justify-end">
      <UFieldGroup>
        <UButton
          :variant="mobileView === 'write' ? 'solid' : 'outline'"
          color="neutral"
          icon="i-lucide-pencil"
          aria-label="Write"
          @click="mobileView = 'write'"
        />
        <UButton
          :variant="mobileView === 'preview' ? 'solid' : 'outline'"
          color="neutral"
          icon="i-lucide-eye"
          aria-label="Preview"
          @click="mobileView = 'preview'"
        />
      </UFieldGroup>
    </div>

    <div class="flex flex-col md:flex-row md:items-start gap-4">
      <!-- Raw editor (auto-grows) -->
      <div
        class="flex-1 min-w-0"
        :class="{ 'hidden md:block': mobileView !== 'write' }"
      >
        <textarea
          ref="textareaRef"
          v-model="bodyModel"
          class="files-doc-textarea"
          placeholder="Write markdown here…"
          spellcheck="false"
          @input="resize"
        />
      </div>

      <!-- Live preview -->
      <div
        class="flex-1 min-w-0 rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) p-4 min-h-[60vh]"
        :class="{ 'hidden md:block': mobileView !== 'preview' }"
      >
        <FilesRenderer :body-md="bodyMd" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.files-doc-textarea {
  display: block;
  width: 100%;
  min-height: 60vh;
  resize: none;
  overflow: hidden; /* height is driven by JS auto-grow; no inner scrollbar */
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  background: var(--ui-bg);
  color: var(--ui-text);
  padding: 1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  outline: none;
}
.files-doc-textarea:focus {
  border-color: var(--ui-primary);
}
</style>
