<script setup lang="ts">
const { apps } = await useApps()
const activeApp = useActiveApp(apps)
</script>

<template>
  <aside class="hidden lg:flex flex-col items-center w-14 shrink-0 border-r border-(--ui-border) bg-neutral-200 dark:bg-neutral-950 py-3 gap-1 sticky top-[57px] h-[calc(100vh-57px)]">
    <NuxtLink
      v-for="app in apps"
      :key="app.id"
      :to="app.path"
      class="flex flex-col items-center justify-center size-10 rounded-md transition-colors"
      :class="activeApp?.id === app.id
        ? 'bg-(--ui-bg-accented) text-(--ui-text)'
        : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'"
      :title="app.title"
      :aria-label="app.title"
    >
      <UIcon
        :name="app.icon || 'i-lucide-square'"
        class="size-5"
      />
    </NuxtLink>
  </aside>
</template>
