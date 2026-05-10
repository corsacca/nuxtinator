<script setup lang="ts">
// Thin wrapper around emoji-mart's Picker (vanilla / web-component style).
// Emits "select" with the chosen unicode emoji.

import data from '@emoji-mart/data'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — emoji-mart ships its own type stubs that don't match strict mode
import { Picker } from 'emoji-mart'

const emit = defineEmits<{
  select: [emoji: string]
}>()

const container = ref<HTMLElement | null>(null)

onMounted(() => {
  if (!container.value) return
  // The Picker constructor mounts a custom element into the DOM. We append it
  // to our container.
  const picker = new Picker({
    data,
    theme: 'auto',
    previewPosition: 'none',
    skinTonePosition: 'none',
    onEmojiSelect: (e: { native?: string }) => {
      if (e.native) emit('select', e.native)
    }
  })
  container.value.appendChild(picker as unknown as Node)
})
</script>

<template>
  <div ref="container" class="emoji-picker-wrap" />
</template>

<style scoped>
.emoji-picker-wrap {
  display: inline-block;
}
</style>
