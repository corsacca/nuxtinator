<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-2">
      Events
    </h1>
    <p class="text-(--ui-text-muted)">
      Events list will appear here.
    </p>
  </div>
</template>
