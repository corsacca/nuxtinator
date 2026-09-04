<script setup lang="ts">
import { diffLines } from 'diff'
import type { AssistantProposal } from '../../composables/useContextAssistant'

const props = defineProps<{
  proposal: AssistantProposal
  index: number
  total: number
  canApply: boolean
  busy: boolean
  showPortfolio: boolean
}>()
const emit = defineEmits<{ decide: [action: 'apply' | 'reject'] }>()

const normalize = (s: string) => (s.endsWith('\n') ? s : `${s}\n`)
const chunks = computed(() => diffLines(normalize(props.proposal.current_content), normalize(props.proposal.proposed_content)))
</script>

<template>
  <div
    class="border rounded-lg overflow-hidden"
    :class="proposal.status === 'applied'
      ? 'border-(--ui-success)'
      : proposal.status === 'rejected' ? 'border-(--ui-border) opacity-60' : 'border-(--ui-border)'"
  >
    <div class="px-3 py-2 bg-(--ui-bg-elevated) border-b border-(--ui-border) flex items-center justify-between gap-2">
      <div class="min-w-0 text-xs">
        <span class="font-medium">{{ proposal.section_title }}</span>
        <span v-if="showPortfolio" class="text-(--ui-text-muted)"> · {{ proposal.portfolio_name }}</span>
        <span class="text-(--ui-text-dimmed)"> · {{ index + 1 }} of {{ total }}</span>
      </div>
      <UBadge
        v-if="proposal.status === 'applied'"
        color="success"
        variant="subtle"
        size="sm"
        icon="i-lucide-check"
      >
        Applied
      </UBadge>
      <UBadge
        v-else-if="proposal.status === 'rejected'"
        color="neutral"
        variant="subtle"
        size="sm"
      >
        Rejected
      </UBadge>
    </div>

    <div class="max-h-64 overflow-auto text-xs font-mono">
      <div
        v-for="(chunk, i) in chunks"
        :key="i"
        class="px-3 py-0.5 whitespace-pre-wrap"
        :class="chunk.added
          ? 'bg-(--ui-success)/10 border-l-2 border-(--ui-success)'
          : chunk.removed ? 'bg-(--ui-error)/10 border-l-2 border-(--ui-error) line-through opacity-70' : ''"
      >{{ chunk.value }}</div>
    </div>

    <div
      v-if="proposal.status === 'pending'"
      class="px-3 py-2 border-t border-(--ui-border) bg-(--ui-bg-elevated) flex items-center gap-2"
    >
      <UButton
        v-if="canApply"
        size="xs"
        color="success"
        icon="i-lucide-check"
        :loading="busy"
        @click="emit('decide', 'apply')"
      >
        Accept
      </UButton>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="busy"
        @click="emit('decide', 'reject')"
      >
        Reject
      </UButton>
      <span v-if="!canApply" class="text-xs text-(--ui-text-muted)">You can't apply changes.</span>
    </div>
  </div>
</template>
