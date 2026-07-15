<script setup lang="ts">
// Reply-toolbar picker for canned responses. A dropdown of snippet titles;
// choosing one emits its HTML for the composer to append. Renders nothing when
// the list is empty (or failed to load) so it degrades silently.
import type { InboxCannedResponse } from '../../composables/useInboxCanned'

const props = defineProps<{ items: InboxCannedResponse[] }>()
const emit = defineEmits<{ insert: [bodyHtml: string] }>()

const menuItems = computed(() =>
  props.items.map(r => ({
    label: r.title,
    icon: 'i-lucide-message-square-text',
    onSelect: () => emit('insert', r.bodyHtml)
  }))
)
</script>

<template>
  <UDropdownMenu v-if="items.length" :items="menuItems" :content="{ align: 'start' }">
    <UButton icon="i-lucide-message-square-text" label="Canned" size="xs" color="neutral" variant="ghost" />
  </UDropdownMenu>
</template>
