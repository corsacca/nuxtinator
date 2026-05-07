<script setup lang="ts">
const route = useRoute()
const orgSlug = computed(() => route.params.orgSlug as string)

const tabs = computed(() => [
  { label: 'General', to: `/@${orgSlug.value}/settings`, key: 'general' },
  { label: 'Members', to: `/@${orgSlug.value}/settings/members`, key: 'members' },
  { label: 'Roles', to: `/@${orgSlug.value}/settings/roles`, key: 'roles' },
  { label: 'Apps', to: `/@${orgSlug.value}/settings/apps`, key: 'apps' },
  { label: 'Activity', to: `/@${orgSlug.value}/settings/audit`, key: 'audit' }
])

const isActive = (to: string, key: string) => {
  if (key === 'general') return route.path === to
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <nav class="flex flex-wrap gap-2 border-b border-(--ui-border) pb-2 mb-4">
    <NuxtLink
      v-for="t in tabs"
      :key="t.key"
      :to="t.to"
      class="px-3 py-1.5 rounded-md text-sm hover:bg-(--ui-bg-elevated)"
      :class="isActive(t.to, t.key)
        ? 'bg-(--ui-bg-elevated) font-semibold'
        : 'text-(--ui-text-muted)'"
    >
      {{ t.label }}
    </NuxtLink>
  </nav>
</template>
