<script setup lang="ts">
// Every help widget in the org — one per site.
import type { HelpinatorWidget, HelpinatorPortfolioOption } from '../../../utils/helpinator-types'

definePageMeta({ middleware: 'auth' })

const pathTo = useHelpinatorPath()
const { data: status } = useHelpinatorStatus()
const { data: widgets, pending } = useFetch<HelpinatorWidget[]>('/api/helpinator/widgets', { default: () => [] })
const { data: portfolios } = useFetch<HelpinatorPortfolioOption[]>('/api/helpinator/portfolios', { default: () => [] })

const portfolioName = (id: string | null) => portfolios.value?.find((p: HelpinatorPortfolioOption) => p.id === id)?.name ?? null
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <UButton
      :to="pathTo('/helpinator')"
      icon="i-lucide-arrow-left"
      variant="ghost"
      color="neutral"
      size="sm"
    >
      Conversations
    </UButton>

    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold flex-1">
        Help widgets
      </h1>
      <UButton v-if="status?.canManage" :to="pathTo('/helpinator/widgets/new')" icon="i-lucide-plus">
        New widget
      </UButton>
    </div>

    <UAlert
      v-if="status && !status.inboxAvailable"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Handoff is off"
      description="The inbox app isn't installed on this deployment, so widgets won't offer 'Still need help?'."
    />

    <div v-if="!pending && widgets.length === 0" class="text-center py-16 text-(--ui-text-muted)">
      <UIcon name="i-lucide-app-window" class="size-10 mb-3" />
      <p>No widgets yet. Create one for each site you want to add help chat to.</p>
    </div>

    <ul v-else class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-lg overflow-hidden">
      <li v-for="w in widgets" :key="w.id">
        <NuxtLink
          :to="pathTo(`/helpinator/widgets/${w.id}`)"
          class="flex items-center gap-4 px-4 py-3 hover:bg-(--ui-bg-elevated) transition-colors"
        >
          <span class="size-4 rounded-full shrink-0" :style="{ background: w.appearance.primary_color }" />
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate">
              {{ w.name }}
            </p>
            <p class="text-sm text-(--ui-text-muted) truncate">
              {{ portfolioName(w.portfolio_id) ?? 'No portfolio (unavailable)' }}
              · {{ w.allowed_origins.length ? w.allowed_origins.join(', ') : 'no sites allowed yet' }}
            </p>
          </div>
          <UBadge :color="w.enabled && w.portfolio_id ? 'success' : 'neutral'" variant="subtle">
            {{ w.enabled && w.portfolio_id ? 'Live' : 'Off' }}
          </UBadge>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
