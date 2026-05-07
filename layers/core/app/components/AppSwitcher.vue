<script setup lang="ts">
const { apps, pending } = await useApps()
const open = ref(false)
</script>

<template>
  <UPopover
    v-model:open="open"
    :ui="{ content: 'w-72' }"
  >
    <UButton
      icon="i-lucide-grid-2x2"
      variant="ghost"
      color="neutral"
      size="sm"
      aria-label="Open app launcher"
    />

    <template #content>
      <div class="p-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-muted) px-1 pb-2">
          Apps
        </p>

        <div
          v-if="pending && apps.length === 0"
          class="px-2 py-6 text-center text-sm text-(--ui-text-muted)"
        >
          Loading...
        </div>

        <div
          v-else-if="apps.length === 0"
          class="px-2 py-6 text-center text-sm text-(--ui-text-muted)"
        >
          No apps installed.
        </div>

        <div
          v-else
          class="grid grid-cols-3 gap-2"
        >
          <NuxtLink
            v-for="app in apps"
            :key="app.id"
            :to="app.path"
            class="flex flex-col items-center justify-center gap-1.5 rounded-md p-3 hover:bg-(--ui-bg-accented) transition-colors text-center"
            @click="open = false"
          >
            <UIcon
              :name="app.icon || 'i-lucide-square'"
              class="size-6 text-(--ui-text)"
            />
            <span class="text-xs text-(--ui-text) line-clamp-2">{{ app.title }}</span>
          </NuxtLink>
        </div>
      </div>
    </template>
  </UPopover>
</template>
