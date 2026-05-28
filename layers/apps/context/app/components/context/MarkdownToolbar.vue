<script setup lang="ts">
const props = defineProps<{ textareaId: string }>()

function getEl(): HTMLTextAreaElement | null {
  return document.getElementById(props.textareaId) as HTMLTextAreaElement | null
}

function wrap(prefix: string, suffix = prefix) {
  const el = getEl()
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const before = el.value.slice(0, start)
  const sel = el.value.slice(start, end)
  const after = el.value.slice(end)
  el.value = `${before}${prefix}${sel || 'text'}${suffix}${after}`
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  el.selectionStart = start + prefix.length
  el.selectionEnd = start + prefix.length + (sel || 'text').length
}

function linePrefix(prefix: string) {
  const el = getEl()
  if (!el) return
  const start = el.selectionStart
  const before = el.value.slice(0, start)
  const lineStart = before.lastIndexOf('\n') + 1
  el.value = `${el.value.slice(0, lineStart)}${prefix}${el.value.slice(lineStart)}`
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
}
</script>

<template>
  <div class="flex items-center gap-1 px-3 py-1 border-b border-(--ui-border) bg-(--ui-bg)">
    <UButton variant="ghost" size="xs" icon="i-lucide-bold" @click="wrap('**')" />
    <UButton variant="ghost" size="xs" icon="i-lucide-italic" @click="wrap('*')" />
    <UButton variant="ghost" size="xs" icon="i-lucide-code" @click="wrap('`')" />
    <UButton variant="ghost" size="xs" icon="i-lucide-link" @click="wrap('[', '](url)')" />
    <div class="w-px h-4 bg-(--ui-border) mx-1" />
    <UButton variant="ghost" size="xs" icon="i-lucide-heading-1" @click="linePrefix('# ')" />
    <UButton variant="ghost" size="xs" icon="i-lucide-heading-2" @click="linePrefix('## ')" />
    <UButton variant="ghost" size="xs" icon="i-lucide-list" @click="linePrefix('- ')" />
    <UButton variant="ghost" size="xs" icon="i-lucide-quote" @click="linePrefix('> ')" />
  </div>
</template>
