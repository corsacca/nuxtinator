<script setup lang="ts">
const props = defineProps<{ section: { has_content: boolean, is_custom: boolean, last_edited_at: string | null } }>()
</script>

<template>
  <UBadge
    v-if="props.section.is_custom"
    color="primary"
    variant="soft"
    size="xs"
  >
    Custom
  </UBadge>
  <UBadge
    v-else-if="!props.section.has_content"
    color="neutral"
    variant="subtle"
    size="xs"
  >
    Empty
  </UBadge>
</template>
