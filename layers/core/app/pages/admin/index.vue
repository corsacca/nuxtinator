<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin']
})
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">
      Dashboard
    </h1>
  </div>
</template>
