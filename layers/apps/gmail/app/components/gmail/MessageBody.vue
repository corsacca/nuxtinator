<script setup lang="ts">
// Renders a sanitised body inside a sandboxed frame (no scripts) and sizes
// the frame to its content. The frame keeps a white ground because mail is
// authored for one, whatever the app theme is.
const props = defineProps<{ html: string | null, text: string | null }>()

const frame = ref<HTMLIFrameElement | null>(null)
const height = ref('120px')

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const doc = computed(() => {
  const body = props.html
    ? props.html
    : `<pre style="white-space:pre-wrap;font:inherit;margin:0">${escapeText(props.text ?? '')}</pre>`
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">`
    + `<style>html,body{margin:0;padding:0}body{padding:4px 2px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2328;background:#fff;word-break:break-word;overflow-wrap:anywhere}`
    + `img{max-width:100%;height:auto}blockquote{margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;color:#57606a}a{color:#0969da}</style>`
    + `</head><body>${body}</body></html>`
})

let observer: ResizeObserver | null = null
let settle: ReturnType<typeof setInterval> | null = null

function measure() {
  const d = frame.value?.contentDocument
  if (!d?.documentElement) return
  const h = Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0)
  if (h > 0) height.value = `${h + 8}px`
}

function onLoad() {
  measure()
  observer?.disconnect()
  const body = frame.value?.contentDocument?.body
  if (body && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measure())
    observer.observe(body)
  }
  // Images without dimensions land after load; poll briefly so the frame
  // grows with them.
  if (settle) clearInterval(settle)
  let ticks = 0
  settle = setInterval(() => {
    measure()
    if (++ticks > 12 && settle) {
      clearInterval(settle)
      settle = null
    }
  }, 250)
}

onBeforeUnmount(() => {
  observer?.disconnect()
  if (settle) clearInterval(settle)
})
</script>

<template>
  <iframe
    ref="frame"
    :srcdoc="doc"
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    class="w-full border-0 rounded-md bg-white"
    :style="{ height }"
    title="Message"
    @load="onLoad"
  />
</template>
