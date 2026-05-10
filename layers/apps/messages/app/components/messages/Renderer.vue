<script setup lang="ts">
// Markdown renderer. Parses body_md via `marked`, sanitizes the result with
// DOMPurify, post-processes mention links, and exposes a "select-to-comment"
// affordance: when the user selects text within the rendered surface, a
// floating button appears next to the selection that, when clicked, emits
// the resolved Hypothesis-style anchor payload.

import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { buildAnchorFromSelection, type AnchorPayload } from '../../utils/anchor'

const props = withDefaults(defineProps<{
  bodyMd: string | null
  enableAnchorComment?: boolean
}>(), {
  enableAnchorComment: false
})

const emit = defineEmits<{
  selectAnchor: [payload: AnchorPayload]
}>()

const MENTION_RE = /<a href="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})">@([^<]+)<\/a>/g

const html = computed(() => {
  const md = props.bodyMd ?? ''
  if (!md) return ''
  let raw: string
  try {
    raw = marked.parse(md, { async: false, breaks: true, gfm: true }) as string
  } catch {
    raw = ''
  }
  const withMentions = raw.replace(MENTION_RE, (_m, id, label) => {
    const safeId = String(id).replace(/"/g, '&quot;')
    const safeLabel = String(label).replace(/</g, '&lt;')
    return `<span class="mention" data-user-id="${safeId}">@${safeLabel}</span>`
  })
  // Make rendered <a> tags non-draggable so users can select text across links.
  // Browsers default to drag-and-drop on links, which otherwise breaks selection.
  const noDrag = withMentions.replace(/<a /g, '<a draggable="false" ')
  return DOMPurify.sanitize(noDrag, {
    ADD_ATTR: ['data-user-id', 'draggable'],
    ADD_TAGS: ['span']
  })
})

// --- Anchor selection ---
const wrap = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)
const anchorBtn = ref<{ top: number, left: number } | null>(null)
let pendingAnchor: AnchorPayload | null = null

function onMouseUp(event: MouseEvent) {
  if (!props.enableAnchorComment) return
  if (!root.value) return
  // Don't react to mouseup on the floating anchor button — its own click
  // handler should run with `pendingAnchor` still set.
  const target = event.target as Element | null
  if (target?.closest('[data-anchor-btn]')) return
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    anchorBtn.value = null
    pendingAnchor = null
    return
  }
  const range = sel.getRangeAt(0)
  if (!root.value.contains(range.commonAncestorContainer)) {
    anchorBtn.value = null
    pendingAnchor = null
    return
  }
  const payload = buildAnchorFromSelection(sel, root.value, props.bodyMd ?? '')
  if (!payload) {
    anchorBtn.value = null
    pendingAnchor = null
    return
  }
  pendingAnchor = payload
  // Position relative to the wrapper (which is `position: relative`). Using
  // absolute (not fixed) sidesteps containing-block issues caused by
  // transformed modal ancestors.
  const rect = range.getBoundingClientRect()
  const wrapEl = wrap.value
  if (!wrapEl) return
  const wrapRect = wrapEl.getBoundingClientRect()
  anchorBtn.value = {
    top: rect.top - wrapRect.top - 36,
    left: rect.left - wrapRect.left + rect.width / 2 - 60
  }
}

function dismiss() {
  anchorBtn.value = null
  pendingAnchor = null
  window.getSelection()?.removeAllRanges()
}

function commit() {
  console.log('[messages] anchor-comment commit', { hasPending: !!pendingAnchor, pendingAnchor })
  if (!pendingAnchor) return
  emit('selectAnchor', pendingAnchor)
  dismiss()
}

function onDocClick(e: MouseEvent) {
  if (!anchorBtn.value) return
  const target = e.target as Element | null
  if (target?.closest('[data-anchor-btn]')) return
  // Closing if the user clicked outside the renderer
  if (root.value && !root.value.contains(target)) {
    anchorBtn.value = null
    pendingAnchor = null
  }
}

function onDragStart(e: DragEvent) {
  // Prevent the browser from starting a drag-and-drop on links inside the
  // renderer — that would abort text selection across links.
  if (root.value && root.value.contains(e.target as Node)) {
    e.preventDefault()
  }
}

onMounted(() => {
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('click', onDocClick)
  document.addEventListener('dragstart', onDragStart)
})
onBeforeUnmount(() => {
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('dragstart', onDragStart)
})

defineExpose({
  getRootEl: () => root.value
})
</script>

<template>
  <div ref="wrap" class="renderer-wrap">
    <div ref="root" class="markdown-body" v-html="html" />

    <button
      v-if="anchorBtn"
      data-anchor-btn
      class="anchor-comment-btn"
      :style="{ top: `${anchorBtn.top}px`, left: `${anchorBtn.left}px` }"
      @mousedown.prevent.stop="commit"
    >
      <UIcon name="i-lucide-message-square-plus" class="size-4" />
      <span>Comment</span>
    </button>
  </div>
</template>

<style scoped>
.markdown-body {
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--ui-text);
}
.markdown-body :deep(p) {
  margin: 0 0 0.5rem 0;
}
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  font-weight: 600;
  margin: 0.75rem 0 0.5rem;
  line-height: 1.3;
}
.markdown-body :deep(h1) { font-size: 1.5rem; }
.markdown-body :deep(h2) { font-size: 1.25rem; }
.markdown-body :deep(h3) { font-size: 1.125rem; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.25rem;
  margin: 0 0 0.5rem 0;
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
  margin: 0.5rem 0;
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
  margin: 0.5rem 0;
}
.markdown-body :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
  -webkit-user-drag: none;
  user-select: text;
  -webkit-user-select: text;
}
.markdown-body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--ui-border);
  margin: 0.75rem 0;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 0.5rem 0;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--ui-border);
  padding: 0.25rem 0.5rem;
}
.markdown-body :deep(.mention) {
  background-color: var(--ui-bg-elevated);
  color: var(--ui-primary);
  border-radius: 4px;
  padding: 0.1em 0.3em;
  font-weight: 500;
  white-space: nowrap;
}
.markdown-body :deep(.anchor-highlight) {
  background-color: rgba(250, 204, 21, 0.35);
  border-bottom: 1px solid rgba(250, 204, 21, 0.7);
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.markdown-body :deep(.anchor-highlight:hover) {
  background-color: rgba(250, 204, 21, 0.55);
}
.renderer-wrap {
  position: relative;
}
.anchor-comment-btn {
  position: absolute;
  z-index: 100;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: var(--ui-primary);
  color: white;
  border: 0;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 500;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}
.anchor-comment-btn:hover {
  filter: brightness(1.05);
}
</style>
