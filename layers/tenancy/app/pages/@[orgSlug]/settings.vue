<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const orgSlug = computed(() => route.params.orgSlug as string)

const tabs = [
  { title: 'General', path: '', icon: 'i-lucide-settings' },
  { title: 'Members', path: 'members', icon: 'i-lucide-users' },
  { title: 'Roles', path: 'roles', icon: 'i-lucide-shield' },
  { title: 'Apps', path: 'apps', icon: 'i-lucide-grid-2x2' }
]

function isActive(path: string) {
  const base = `/@${orgSlug.value}/settings`
  if (!path) return route.path === base || route.path === `${base}/`
  return route.path === `${base}/${path}` || route.path.startsWith(`${base}/${path}/`)
}
</script>

<template>
  <div>
    <div class="max-w-4xl mx-auto mb-6">
      <h1 class="text-3xl font-bold mb-4">
        Settings
      </h1>
      <nav class="flex flex-wrap gap-2 border-b border-(--ui-border) pb-2">
        <NuxtLink
          v-for="t in tabs"
          :key="t.path"
          :to="`/@${orgSlug}/settings${t.path ? '/' + t.path : ''}`"
          :class="[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm hover:bg-(--ui-bg-elevated)',
            isActive(t.path) && 'bg-(--ui-bg-elevated) text-(--ui-text-highlighted) font-medium'
          ]"
        >
          <UIcon
            :name="t.icon"
            class="size-4"
          />
          {{ t.title }}
        </NuxtLink>
      </nav>
    </div>
    <NuxtPage />
  </div>
</template>
