<script setup lang="ts">
// Markdown renderer: parses body_md via `marked`, sanitizes with DOMPurify.
// Adapted from the messages layer's Renderer, minus the select-to-comment
// anchoring (comments are a v2 feature for the files layer).

import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  bodyMd: string | null
}>()

const html = computed(() => {
  const md = props.bodyMd ?? ''
  if (!md) return ''
  let raw: string
  try {
    raw = marked.parse(md, { async: false, breaks: true, gfm: true }) as string
  } catch {
    raw = ''
  }
  return DOMPurify.sanitize(raw)
})
</script>

<template>
  <div v-if="html" class="markdown-body" v-html="html" />
  <p v-else class="text-(--ui-text-muted) italic text-sm">
    This document is empty.
  </p>
</template>

<style scoped>
.markdown-body {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--ui-text);
}
.markdown-body :deep(p) { margin: 0 0 0.75rem 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  font-weight: 600;
  margin: 1rem 0 0.5rem;
  line-height: 1.3;
}
.markdown-body :deep(h1) { font-size: 1.6rem; }
.markdown-body :deep(h2) { font-size: 1.3rem; }
.markdown-body :deep(h3) { font-size: 1.15rem; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.25rem;
  margin: 0 0 0.75rem 0;
}
.markdown-body :deep(ul) { list-style-type: disc; }
.markdown-body :deep(ol) { list-style-type: decimal; }
.markdown-body :deep(li) { margin: 0.125rem 0; }
.markdown-body :deep(li > p) { margin: 0; }
.markdown-body :deep(code) {
  background: var(--ui-bg-elevated);
  padding: 0.1em 0.3em;
  border-radius: 4px;
  font-size: 0.875em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.markdown-body :deep(pre) {
  background: var(--ui-bg-elevated);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin: 0.75rem 0;
}
.markdown-body :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 0.875rem;
}
.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--ui-border-accented);
  padding-left: 0.75rem;
  color: var(--ui-text-muted);
  margin: 0.75rem 0;
}
.markdown-body :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}
.markdown-body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--ui-border);
  margin: 1rem 0;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0.75rem 0;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--ui-border);
  padding: 0.25rem 0.5rem;
}
.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
</style>
