<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin']
})

type AppStatus = 'disabled' | 'available' | 'default'

interface AdminApp {
  id: string
  title: string
  description?: string
  icon?: string
  status: AppStatus
  installed: boolean
  created_at: string
  updated_at: string
}

const toast = useToast()

// Multi-tenant exposes three availability tiers per org; single-tenant has no
// orgs, so an app is simply on or off for this instance.
const tenancyEnabled = computed(() => useRuntimeConfig().public.tenancy === true)

const { data, pending, refresh } = await useFetch<{ apps: AdminApp[] }>(
  '/api/admin/apps',
  { default: () => ({ apps: [] }) }
)
const apps = computed(() => data.value?.apps ?? [])

const STATUS_OPTIONS: { value: AppStatus, label: string, description: string, color: 'success' | 'neutral' | 'error', icon: string }[] = [
  { value: 'default', label: 'Default', description: 'Auto-enabled for every new org.', color: 'success', icon: 'i-lucide-circle-check' },
  { value: 'available', label: 'Available', description: 'Org admin must opt in.', color: 'neutral', icon: 'i-lucide-circle-dashed' },
  { value: 'disabled', label: 'Disabled', description: 'Hidden from every org.', color: 'error', icon: 'i-lucide-circle-x' }
]
const statusMeta = (s: AppStatus) => STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[1]!

const onSetStatus = async (app: AdminApp, status: AppStatus) => {
  if (status === app.status) return
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
        <template v-if="tenancyEnabled">
          Set the global availability for each app. Each option is described in the dropdown.
        </template>
        <template v-else>
          Enable or disable each app for this instance.
        </template>
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
          <AppIcon
            :name="app.icon"
            class="size-6 mt-1 shrink-0 text-sm"
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
        <!-- Single-tenant: a plain on/off switch. "On" stores `default` (shown
             in the launcher); "off" stores `disabled` (hidden). The `available`
             tier is multi-tenant-only (it means "org admin must opt in"), so it
             isn't offered here. -->
        <div
          v-if="!tenancyEnabled"
          class="flex items-center gap-2 shrink-0"
        >
          <span class="text-sm text-(--ui-text-muted)">
            {{ app.status === 'disabled' ? 'Disabled' : 'Enabled' }}
          </span>
          <USwitch
            :model-value="app.status !== 'disabled'"
            size="lg"
            @update:model-value="(v: boolean) => onSetStatus(app, v ? 'default' : 'disabled')"
          />
        </div>
        <USelectMenu
          v-else
          :model-value="app.status"
          :items="STATUS_OPTIONS"
          value-key="value"
          label-key="label"
          :search="false"
          :color="statusMeta(app.status).color"
          variant="outline"
          size="sm"
          class="w-44 shrink-0"
          @update:model-value="(v: AppStatus) => onSetStatus(app, v)"
        >
          <template #leading>
            <UIcon
              :name="statusMeta(app.status).icon"
              class="size-4"
            />
          </template>
          <template #item="{ item }">
            <div class="flex items-start gap-2 py-0.5">
              <UIcon
                :name="(item as typeof STATUS_OPTIONS[number]).icon"
                class="size-4 mt-0.5 shrink-0"
              />
              <div>
                <div class="font-medium leading-tight">
                  {{ (item as typeof STATUS_OPTIONS[number]).label }}
                </div>
                <div class="text-xs text-(--ui-text-muted) leading-tight mt-0.5">
                  {{ (item as typeof STATUS_OPTIONS[number]).description }}
                </div>
              </div>
            </div>
          </template>
        </USelectMenu>
      </li>
    </ul>
  </div>
</template>
