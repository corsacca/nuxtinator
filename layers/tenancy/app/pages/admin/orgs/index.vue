<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin']
})

interface AdminOrg {
  id: string
  slug: string
  name: string
  suspended: boolean
  created_at: string
  member_count: number
  app_count: number
}

const { data, pending } = await useFetch<{ orgs: AdminOrg[] }>(
  '/api/admin/orgs',
  { default: () => ({ orgs: [] }) }
)
const orgs = computed(() => data.value?.orgs ?? [])
</script>

<template>
  <div class="space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">
          Organizations
        </h1>
        <p class="text-sm text-(--ui-text-muted)">
          Every org in this deployment.
        </p>
      </div>
      <UButton
        to="/orgs/new"
        icon="i-lucide-plus"
      >
        Create org
      </UButton>
    </header>

    <div
      v-if="pending && orgs.length === 0"
      class="text-sm text-(--ui-text-muted)"
    >
      Loading...
    </div>

    <ul
      v-else
      class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md"
    >
      <li
        v-for="o in orgs"
        :key="o.id"
        class="flex items-center justify-between gap-3 p-4"
      >
        <div class="min-w-0">
          <div class="font-medium">
            {{ o.name }}
          </div>
          <div class="text-xs text-(--ui-text-muted)">
            /@{{ o.slug }} · {{ o.member_count }} member{{ o.member_count === 1 ? '' : 's' }} · {{ o.app_count }} app{{ o.app_count === 1 ? '' : 's' }}
          </div>
        </div>
        <UBadge
          v-if="o.suspended"
          color="error"
          variant="subtle"
        >
          Suspended
        </UBadge>
      </li>
    </ul>
  </div>
</template>
