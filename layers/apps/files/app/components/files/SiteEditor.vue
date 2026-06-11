<script setup lang="ts">
// HTML site editor body. Desktop: two columns — raw HTML source | live iframe
// preview. The textarea auto-grows to its content (the page owns the
// scrollbar) while the preview pane is a fixed-height sticky iframe, since a
// sandboxed iframe's content height can't be measured from outside. Mobile: a
// Write/Preview toggle. Title, Save, and the Display/Edit switch live in the
// page header.
//
// The preview iframe is sandboxed WITHOUT allow-same-origin so the pasted
// HTML runs in an opaque origin — its scripts can't reach this app's DOM,
// storage, or make credentialed /api calls. Same posture as the public raw
// serve route's CSP. Never add allow-same-origin.

const props = defineProps<{
  html: string
}>()

const emit = defineEmits<{
  'update:html': [v: string]
}>()

// Mobile-only view toggle. On md+ both panes always show (split).
const mobileView = ref<'write' | 'preview'>('write')

const htmlModel = computed({
  get: () => props.html,
  set: v => emit('update:html', v)
})

// Auto-grow the textarea so it never scrolls internally — the page scrolls.
const textareaRef = ref<HTMLTextAreaElement | null>(null)
function resize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
watch(htmlModel, () => nextTick(resize))
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
      <!-- Raw HTML source (auto-grows) -->
      <div
        class="flex-1 min-w-0"
        :class="{ 'hidden md:block': mobileView !== 'write' }"
      >
        <textarea
          ref="textareaRef"
          v-model="htmlModel"
          class="files-site-textarea"
          placeholder="Paste or write HTML here…"
          spellcheck="false"
          @input="resize"
        />
      </div>

      <!-- Live preview (sticky so it tracks while scrolling long source) -->
      <div
        class="flex-1 min-w-0 md:sticky md:top-4"
        :class="{ 'hidden md:block': mobileView !== 'preview' }"
      >
        <iframe
          :srcdoc="html"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          title="Site preview"
          class="w-full h-[75vh] rounded-lg border border-(--ui-border) bg-white"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.files-site-textarea {
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
.files-site-textarea:focus {
  border-color: var(--ui-primary);
}
</style>
