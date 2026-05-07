<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin']
})

interface AdminApp {
  id: string
  title: string
  description?: string
  icon?: string
  status: 'disabled' | 'available' | 'default'
  installed: boolean
  created_at: string
  updated_at: string
}

const toast = useToast()

const { data, pending, refresh } = await useFetch<{ apps: AdminApp[] }>(
  '/api/admin/apps',
  { default: () => ({ apps: [] }) }
)
const apps = computed(() => data.value?.apps ?? [])

const onSetStatus = async (app: AdminApp, status: AdminApp['status']) => {
  try {
    await $fetch(`/api/admin/apps/${app.id}`, {
      method: 'PATCH',
      body: { status }
    })
    toast.add({ title: `Status updated to ${status}`, color: 'success' })
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Update failed',
      description: (err as { data?: { statusMessage?: string } } | null)?.data?.statusMessage,
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="space-y-4">
    <header>
      <h1 class="text-2xl font-bold">
        Apps
      </h1>
      <p class="text-sm text-(--ui-text-muted)">
        Set the global status for each installed app.
        <strong>default</strong> auto-enables for every new org;
        <strong>available</strong> requires org-admin opt-in;
        <strong>disabled</strong> hides the app from every org.
      </p>
    </header>

    <div
      v-if="pending && apps.length === 0"
      class="text-sm text-(--ui-text-muted)"
    >
      Loading...
    </div>

    <ul
      v-else
      class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md"
    >
      <li
        v-for="app in apps"
        :key="app.id"
        class="flex items-center justify-between gap-3 p-4"
      >
        <div class="flex items-start gap-3 min-w-0">
          <UIcon
            :name="app.icon || 'i-lucide-square'"
            class="size-6 mt-1 shrink-0"
          />
          <div class="min-w-0">
            <div class="font-medium flex items-center gap-2">
              {{ app.title }}
              <UBadge
                v-if="!app.installed"
                color="warning"
                variant="subtle"
                size="sm"
              >
                Layer not installed
              </UBadge>
            </div>
            <div
              v-if="app.description"
              class="text-xs text-(--ui-text-muted)"
            >
              {{ app.description }}
            </div>
          </div>
        </div>
        <div class="flex gap-1">
          <UButton
            v-for="s in (['default', 'available', 'disabled'] as const)"
            :key="s"
            size="xs"
            :variant="app.status === s ? 'solid' : 'outline'"
            :color="s === 'disabled' ? 'error' : s === 'default' ? 'success' : 'neutral'"
            @click="onSetStatus(app, s)"
          >
            {{ s }}
          </UButton>
        </div>
      </li>
    </ul>
  </div>
</template>
