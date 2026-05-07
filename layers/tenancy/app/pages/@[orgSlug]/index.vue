<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const orgSlug = computed(() => route.params.orgSlug as string)

const { data: org, pending, error } = await useFetch<{
  id: string
  slug: string
  name: string
  member_count: number
  perms: string[]
}>(() => `/api/o/${orgSlug.value}`, {
  watch: [orgSlug],
  key: 'org-detail'
})

const { apps } = await useApps()

const canManageSettings = computed(() => org.value?.perms?.includes('org.settings.write'))
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div
      v-if="pending && !org"
      class="text-sm text-(--ui-text-muted)"
    >
      Loading...
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      :title="(error as { statusMessage?: string } | null)?.statusMessage || 'Failed to load organization'"
    />

    <template v-else-if="org">
      <header class="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-3xl font-bold">
            {{ org.name }}
          </h1>
          <p class="text-sm text-(--ui-text-muted)">
            /@{{ org.slug }}
          </p>
        </div>
        <UButton
          v-if="canManageSettings"
          :to="`/@${org.slug}/settings`"
          variant="outline"
          icon="i-lucide-settings"
        >
          Settings
        </UButton>
      </header>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold">
          Apps
        </h2>
        <div
          v-if="apps.length === 0"
          class="text-sm text-(--ui-text-muted)"
        >
          No apps enabled for this organization.
        </div>
        <div
          v-else
          class="grid grid-cols-2 sm:grid-cols-3 gap-3"
        >
          <NuxtLink
            v-for="app in apps"
            :key="app.id"
            :to="app.path"
            class="flex flex-col items-start rounded-md border border-(--ui-border) p-4 hover:bg-(--ui-bg-elevated) transition-colors"
          >
            <UIcon
              :name="app.icon || 'i-lucide-square'"
              class="size-6 mb-2"
            />
            <div class="font-medium">
              {{ app.title }}
            </div>
            <div
              v-if="app.description"
              class="text-xs text-(--ui-text-muted) mt-1 line-clamp-2"
            >
              {{ app.description }}
            </div>
          </NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>
