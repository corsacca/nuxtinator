<script setup lang="ts">
// Compact consent summary for one channel: a single colored badge — red when
// any purpose is opted out (the safest signal wins), green when everything
// known is opt-in, gray when no consent has been captured. An active delivery
// suppression strikes the badge through. The tooltip carries the per-purpose
// detail.
import type { CrmConsentStateEntry } from '../../composables/useCrmChannels'

const props = defineProps<{
  consents: CrmConsentStateEntry[]
  suppressed?: boolean
}>()

const summary = computed<{ color: 'success' | 'error' | 'neutral', label: string }>(() => {
  if (props.consents.some(c => c.status === 'opt_out')) return { color: 'error', label: 'Opt-out' }
  if (props.consents.some(c => c.status === 'opt_in')) return { color: 'success', label: 'Opt-in' }
  return { color: 'neutral', label: 'No consent' }
})

const tooltip = computed(() => {
  const parts = props.consents.map(c => `${c.purpose}: ${c.status === 'opt_in' ? 'opt-in' : 'opt-out'}`)
  if (props.suppressed) parts.push('delivery suppressed')
  return parts.length > 0 ? parts.join(' · ') : 'No consent captured'
})
</script>

<template>
  <UTooltip :text="tooltip">
    <UBadge
      :color="summary.color"
      variant="subtle"
      size="sm"
      :class="suppressed ? 'line-through' : undefined"
    >
      {{ summary.label }}
    </UBadge>
  </UTooltip>
</template>
