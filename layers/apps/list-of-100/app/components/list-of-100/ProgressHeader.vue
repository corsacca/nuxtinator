<script setup lang="ts">
import type { ListProgress } from '../../utils/list-of-100-types'

const props = defineProps<{
  progress: ListProgress
}>()

const target = 100
const totalPct = computed(() => Math.min(100, Math.round((props.progress.total / target) * 100)))
const contactedPct = computed(() =>
  props.progress.total === 0
    ? 0
    : Math.round((props.progress.contactedLast30d / Math.max(props.progress.total, target)) * 100)
)
const prayedPct = computed(() =>
  props.progress.total === 0
    ? 0
    : Math.round((props.progress.prayedLast30d / Math.max(props.progress.total, target)) * 100)
)
const overTarget = computed(() => props.progress.total > target)
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div class="rounded-lg border border-(--ui-border) p-4">
      <div class="text-xs text-(--ui-text-muted) uppercase tracking-wide">
        On your list
      </div>
      <div class="mt-1 flex items-baseline gap-1">
        <span class="text-2xl font-semibold tabular-nums">{{ progress.total }}</span>
        <span class="text-sm text-(--ui-text-muted)">/ {{ target }}</span>
      </div>
      <UProgress :model-value="totalPct" :max="100" class="mt-2" size="xs" />
      <p v-if="overTarget" class="mt-2 text-xs text-(--ui-text-muted)">
        Zúme suggests focusing on 100. Consider archiving someone before adding more.
      </p>
    </div>

    <div class="rounded-lg border border-(--ui-border) p-4">
      <div class="text-xs text-(--ui-text-muted) uppercase tracking-wide">
        Contacted (last 30d)
      </div>
      <div class="mt-1 flex items-baseline gap-1">
        <span class="text-2xl font-semibold tabular-nums">{{ progress.contactedLast30d }}</span>
        <span class="text-sm text-(--ui-text-muted)">/ {{ target }}</span>
      </div>
      <UProgress :model-value="contactedPct" :max="100" color="info" class="mt-2" size="xs" />
    </div>

    <div class="rounded-lg border border-(--ui-border) p-4">
      <div class="text-xs text-(--ui-text-muted) uppercase tracking-wide">
        Prayed for (last 30d)
      </div>
      <div class="mt-1 flex items-baseline gap-1">
        <span class="text-2xl font-semibold tabular-nums">{{ progress.prayedLast30d }}</span>
        <span class="text-sm text-(--ui-text-muted)">/ {{ target }}</span>
      </div>
      <UProgress :model-value="prayedPct" :max="100" color="success" class="mt-2" size="xs" />
    </div>
  </div>
</template>
