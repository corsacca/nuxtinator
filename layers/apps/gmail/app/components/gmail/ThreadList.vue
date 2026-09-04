<script setup lang="ts">
// The middle pane: search (local as you type, Gmail syntax on Enter), the
// active view's heading, rows, and paging.
import type { GmailThreadRow } from '../../composables/useGmailThreads'
import type { GmailThreadAction } from '../../composables/useGmailThread'

const props = defineProps<{
  items: GmailThreadRow[]
  total: number
  pending: boolean
  error: string | null
  heading: string
  selectedId: string | null
  accountOrder: string[]
  selfAddresses: Set<string>
  view: string
  pageSize: number
}>()

const q = defineModel<string>('q', { required: true })
const gq = defineModel<string>('gq', { required: true })
const page = defineModel<number>('page', { required: true })

const emit = defineEmits<{
  select: [id: string]
  action: [id: string, action: GmailThreadAction, opts?: { wakeAt?: Date }]
  refresh: []
}>()

// The search box drives the local filter on a debounce and the Gmail
// passthrough on Enter.
const draft = ref(gq.value || q.value)
let timer: ReturnType<typeof setTimeout> | null = null
watch(draft, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    if (gq.value) return
    q.value = v
  }, 250)
})
watch(gq, (v) => {
  if (v) draft.value = v
})

function submitGmailSearch() {
  const v = draft.value.trim()
  if (!v) {
    gq.value = ''
    q.value = ''
    return
  }
  q.value = ''
  gq.value = v
}

function clearSearch() {
  draft.value = ''
  q.value = ''
  gq.value = ''
}

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>

<template>
  <div class="w-[26rem] shrink-0 flex flex-col min-h-0 border-r border-(--ui-border)">
    <div class="p-2 border-b border-(--ui-border) space-y-2">
      <UInput
        v-model="draft"
        icon="i-lucide-search"
        placeholder="Search mail — Enter for Gmail search"
        size="sm"
        class="w-full"
        @keydown.enter.prevent="submitGmailSearch"
      >
        <template
          v-if="draft"
          #trailing
        >
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="link"
            square
            @click="clearSearch"
          />
        </template>
      </UInput>
      <div class="flex items-center justify-between gap-2 px-1">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="text-sm font-medium text-(--ui-text-muted) truncate">{{ heading }}</span>
          <UBadge
            v-if="gq"
            label="Gmail search"
            size="sm"
            variant="subtle"
            color="info"
            icon="i-lucide-cloud"
          />
          <span class="text-xs text-(--ui-text-dimmed) shrink-0">{{ total }}</span>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          size="xs"
          color="neutral"
          variant="ghost"
          square
          :loading="pending"
          title="Refresh"
          @click="emit('refresh')"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0">
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="error"
        class="m-2"
      />
      <div
        v-else-if="!items.length && !pending"
        class="p-8 text-center text-sm text-(--ui-text-muted)"
      >
        Nothing here.
      </div>
      <GmailThreadRow
        v-for="t in items"
        :key="t.id"
        :thread="t"
        :selected="t.id === selectedId"
        :color="gmailAccountColor(t.accountId, accountOrder)"
        :show-account="accountOrder.length > 1"
        :self-addresses="selfAddresses"
        :view="view"
        @select="id => emit('select', id)"
        @action="(id, action, opts) => emit('action', id, action, opts)"
      />
    </div>

    <div
      v-if="pageCount > 1"
      class="p-2 border-t border-(--ui-border) flex justify-center"
    >
      <UPagination
        :page="page + 1"
        :total="total"
        :items-per-page="pageSize"
        :sibling-count="1"
        size="xs"
        @update:page="p => page = p - 1"
      />
    </div>
  </div>
</template>
