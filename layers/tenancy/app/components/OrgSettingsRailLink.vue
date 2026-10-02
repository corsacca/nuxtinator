<script setup lang="ts">
const { slug } = useActiveOrg()
const route = useRoute()

// Populated by `org-settings-access.global.ts` after the user first navigates
// into /settings. If we haven't seen perms yet, default to showing the link —
// the middleware will redirect non-admins on click and prime the cache for
// next render.
const settingsPerms = useState<Record<string, string[]>>('tenant:settings-perms', () => ({}))
const canSeeSettings = computed(() => {
  if (!slug.value) return false
  const perms = settingsPerms.value[slug.value]
  if (!perms) return true
  return perms.includes('org.settings.access')
})

const settingsPath = computed(() => `/@${slug.value}/settings`)
const isActive = computed(() => route.path === settingsPath.value || route.path.startsWith(settingsPath.value + '/'))
</script>

<template>
  <NuxtLink
    v-if="canSeeSettings"
    :to="settingsPath"
    class="flex items-center justify-center size-10 rounded-md transition-colors"
    :class="isActive
      ? 'bg-(--ui-bg-accented) text-(--ui-text)'
      : 'text-(--ui-text-muted) hover:bg-(--ui-bg-accented) hover:text-(--ui-text)'"
    title="Organization settings"
    aria-label="Organization settings"
  >
    <UIcon
      name="i-lucide-settings"
      class="size-5"
    />
  </NuxtLink>
</template>
