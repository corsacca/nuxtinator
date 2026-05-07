<script setup lang="ts">
const { apps } = await useApps()
const activeApp = useActiveApp(apps)
</script>

<template>
  <nav class="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-(--ui-border) bg-(--ui-bg-elevated) px-1 pb-[env(safe-area-inset-bottom)]">
    <div class="flex items-stretch justify-around">
      <NuxtLink
        v-for="app in apps"
        :key="app.id"
        :to="app.path"
        class="flex flex-col items-center justify-center gap-0.5 px-2 py-2 min-w-0 flex-1 rounded-md transition-colors"
        :class="activeApp?.id === app.id
          ? 'text-(--ui-text)'
          : 'text-(--ui-text-muted)'"
      >
        <UIcon
          :name="app.icon || 'i-lucide-square'"
          class="size-5"
        />
        <span class="text-[10px] truncate max-w-full">{{ app.title }}</span>
      </NuxtLink>
      <p
        v-if="apps.length === 0"
        class="px-3 py-3 text-xs text-(--ui-text-muted)"
      >
        No apps.
      </p>
    </div>
  </nav>
</template>
