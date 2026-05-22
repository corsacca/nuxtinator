<script setup lang="ts">
const { apps } = await useApps()
const activeApp = useActiveApp(apps)

// Per-app unread badges. Shares the polling loop + state with the bell.
const { byApp, start, stop } = useNotifications()
onMounted(start)
onBeforeUnmount(stop)
</script>

<template>
  <aside class="hidden lg:flex flex-col items-center w-14 shrink-0 border-r border-(--ui-border) bg-neutral-200 dark:bg-neutral-950 py-3 gap-1 sticky top-[57px] h-[calc(100vh-57px)]">
    <NuxtLink
      v-for="app in apps"
      :key="app.id"
      :to="app.path"
      class="relative flex flex-col items-center justify-center size-10 rounded-md transition-colors"
      :class="activeApp?.id === app.id
        ? 'bg-(--ui-bg-accented) text-(--ui-text)'
        : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'"
      :title="app.title"
      :aria-label="app.title"
    >
      <AppIcon :name="app.icon" class="size-5 text-[11px]" />
      <span
        v-if="byApp[app.id]"
        class="rail-badge"
      >
        {{ byApp[app.id]! > 99 ? '99+' : byApp[app.id] }}
      </span>
    </NuxtLink>
  </aside>
</template>

<style scoped>
.rail-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--ui-primary);
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
