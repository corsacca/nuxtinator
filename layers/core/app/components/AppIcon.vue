<script setup lang="ts">
// Renders an app's icon. Most apps register an iconify name (`i-lucide-*`).
// An app can also register a short text label (e.g. "100", "α") by passing
// any value that does NOT start with `i-`; we render it as bold text instead
// of treating it as a (broken) icon name.
defineProps<{
  name?: string | null
  fallback?: string
}>()
</script>

<template>
  <UIcon
    v-if="!name || name.startsWith('i-')"
    :name="name || fallback || 'i-lucide-square'"
  />
  <span
    v-else
    class="inline-flex items-center justify-center font-bold tabular-nums tracking-tight leading-none"
  >{{ name }}</span>
</template>
