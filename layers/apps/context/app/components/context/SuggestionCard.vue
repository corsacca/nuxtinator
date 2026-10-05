<script setup lang="ts">
import { CONTEXT_SUGGESTION_STATUSES, type SuggestionItem } from '../../utils/suggestion-status'

const props = defineProps<{
  suggestion: SuggestionItem
  portfolioSlug: string
  canReview: boolean
  isAuthor: boolean
  busy: boolean
}>()
const emit = defineEmits<{ approve: [], reject: [], withdraw: [] }>()

const pending = computed(() => props.suggestion.status === 'pending')
const status = computed(() => CONTEXT_SUGGESTION_STATUSES[props.suggestion.status])

// A pending suggestion diffs against what approving would replace (the
// current content); a stale one can also be compared with what it was
// written against. A decided one always shows the change as suggested.
const compareWith = ref<'current' | 'base'>('current')
const before = computed(() => pending.value && compareWith.value === 'current'
  ? props.suggestion.current_content
  : props.suggestion.base_content)
</script>

<template>
  <div class="border border-(--ui-border) rounded-lg overflow-hidden" :class="{ 'opacity-70': !pending }">
    <div class="px-3 py-2 bg-(--ui-bg-elevated) border-b border-(--ui-border) flex flex-wrap items-center gap-2">
      <NuxtLink
        v-if="suggestion.section_exists"
        :to="`/context/${portfolioSlug}/sections/${suggestion.section_key}`"
        class="font-medium text-sm hover:underline"
      >
        {{ suggestion.section_title }}
      </NuxtLink>
      <span v-else class="font-medium text-sm">{{ suggestion.section_title }}</span>
      <UBadge :color="status.color" :icon="status.icon" variant="subtle" size="sm">
        {{ status.label }}
      </UBadge>
      <span class="flex-1" />
      <div v-if="pending && suggestion.stale" class="flex items-center gap-1">
        <UButton
          size="xs"
          :variant="compareWith === 'current' ? 'soft' : 'ghost'"
          color="neutral"
          @click="compareWith = 'current'"
        >
          vs current
        </UButton>
        <UButton
          size="xs"
          :variant="compareWith === 'base' ? 'soft' : 'ghost'"
          color="neutral"
          @click="compareWith = 'base'"
        >
          vs original
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="pending && !suggestion.section_exists"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      class="rounded-none"
      description="This section was removed from the portfolio, so the suggestion can't be approved."
    />
    <UAlert
      v-else-if="pending && suggestion.stale"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      class="rounded-none"
      description="The section changed after this was suggested. Approving replaces the current content, including those changes."
    />

    <div class="max-h-[32rem] overflow-auto px-3 py-2 text-sm">
      <ContextTextDiff :before="before" :after="suggestion.proposed_content" />
    </div>

    <div
      v-if="!pending && (suggestion.decided_at || suggestion.review_note)"
      class="px-3 py-2 border-t border-(--ui-border) text-xs text-(--ui-text-muted)"
    >
      <span v-if="suggestion.decided_at">
        {{ status.label }}
        <template v-if="suggestion.decided_by_name"> by {{ suggestion.decided_by_name }}</template>
        · {{ new Date(suggestion.decided_at).toLocaleString() }}
      </span>
      <p v-if="suggestion.review_note" class="mt-1 text-(--ui-text) whitespace-pre-wrap">
        {{ suggestion.review_note }}
      </p>
    </div>

    <div
      v-if="pending && (canReview || isAuthor)"
      class="px-3 py-2 border-t border-(--ui-border) bg-(--ui-bg-elevated) flex items-center gap-2"
    >
      <template v-if="canReview">
        <UButton
          size="xs"
          color="success"
          icon="i-lucide-check"
          :disabled="busy || !suggestion.section_exists"
          @click="emit('approve')"
        >
          Approve
        </UButton>
        <UButton size="xs" color="error" variant="soft" icon="i-lucide-x" :disabled="busy" @click="emit('reject')">
          Reject
        </UButton>
      </template>
      <span class="flex-1" />
      <UButton
        v-if="isAuthor"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-undo-2"
        :disabled="busy"
        @click="emit('withdraw')"
      >
        Withdraw
      </UButton>
    </div>
  </div>
</template>
