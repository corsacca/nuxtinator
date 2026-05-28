<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{ content: string }>()
defineEmits<{ 'select-anchor': [start: number, end: number, quote: string] }>()

const html = computed(() => {
  if (typeof window === 'undefined') return ''
  const raw = marked.parse(props.content ?? '', { async: false }) as string
  return DOMPurify.sanitize(raw)
})
</script>

<template>
  <div class="prose prose-sm max-w-none p-4">
    <div v-html="html" />
  </div>
</template>
