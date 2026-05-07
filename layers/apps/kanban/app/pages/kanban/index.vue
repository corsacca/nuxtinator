<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

type CardPriority = 'low' | 'medium' | 'high'

interface KanbanCard {
  id: string
  title: string
  description?: string
  priority: CardPriority
  assignee: string
  tags: string[]
  dueDate?: string
}

interface KanbanColumn {
  id: string
  title: string
  color: 'primary' | 'success' | 'warning' | 'info' | 'error' | 'neutral'
  cards: KanbanCard[]
}

const priorityColor: Record<CardPriority, 'neutral' | 'warning' | 'error'> = {
  low: 'neutral',
  medium: 'warning',
  high: 'error'
}

const columns = ref<KanbanColumn[]>([
  {
    id: 'backlog',
    title: 'Backlog',
    color: 'neutral',
    cards: [
      {
        id: 'k-1',
        title: 'Research competitor pricing pages',
        description: 'Compare tiers, perks, and CTAs across the top 5.',
        priority: 'low',
        assignee: 'Avery',
        tags: ['research'],
        dueDate: 'May 18'
      },
      {
        id: 'k-2',
        title: 'Spike: WebAuthn login',
        priority: 'medium',
        assignee: 'Marcus',
        tags: ['auth', 'spike']
      },
      {
        id: 'k-3',
        title: 'Draft Q3 OKRs',
        priority: 'low',
        assignee: 'Priya',
        tags: ['planning']
      }
    ]
  },
  {
    id: 'todo',
    title: 'To Do',
    color: 'info',
    cards: [
      {
        id: 'k-4',
        title: 'Wire up billing portal redirect',
        description: 'Hook the “Manage subscription” button to the Stripe portal session.',
        priority: 'high',
        assignee: 'Jordan',
        tags: ['billing'],
        dueDate: 'May 6'
      },
      {
        id: 'k-5',
        title: 'Empty state for /kanban',
        priority: 'medium',
        assignee: 'Sam',
        tags: ['ui']
      },
      {
        id: 'k-6',
        title: 'Write migration runbook',
        priority: 'low',
        assignee: 'Avery',
        tags: ['docs']
      }
    ]
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    color: 'warning',
    cards: [
      {
        id: 'k-7',
        title: 'Multi-tenant RBAC role editor',
        description: 'Granular permissions, default grants by role, audit log entries on save.',
        priority: 'high',
        assignee: 'Marcus',
        tags: ['rbac', 'admin'],
        dueDate: 'May 9'
      },
      {
        id: 'k-8',
        title: 'Mail thread search index',
        priority: 'medium',
        assignee: 'Priya',
        tags: ['mail', 'search']
      }
    ]
  },
  {
    id: 'review',
    title: 'In Review',
    color: 'primary',
    cards: [
      {
        id: 'k-9',
        title: 'Calendar event recurrence rules',
        description: 'RRULE parser + UI for daily/weekly/monthly patterns.',
        priority: 'medium',
        assignee: 'Sam',
        tags: ['calendar'],
        dueDate: 'May 4'
      },
      {
        id: 'k-10',
        title: 'Tighten launcher tile spacing',
        priority: 'low',
        assignee: 'Jordan',
        tags: ['ui', 'polish']
      }
    ]
  },
  {
    id: 'done',
    title: 'Done',
    color: 'success',
    cards: [
      {
        id: 'k-11',
        title: 'Rip out legacy session middleware',
        priority: 'high',
        assignee: 'Marcus',
        tags: ['auth', 'cleanup']
      },
      {
        id: 'k-12',
        title: 'Org slug in launcher URLs',
        priority: 'medium',
        assignee: 'Avery',
        tags: ['routing']
      },
      {
        id: 'k-13',
        title: 'Default theme colors pass',
        priority: 'low',
        assignee: 'Sam',
        tags: ['ui']
      }
    ]
  }
])

const totalCards = computed(() =>
  columns.value.reduce((sum, col) => sum + col.cards.length, 0)
)

const initials = (name: string) =>
  name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-160px)] lg:h-[calc(100vh-130px)]">
    <header class="flex items-center justify-between mb-4 gap-2 flex-wrap">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-semibold">
          Board
        </h1>
        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
        >
          {{ totalCards }} cards
        </UBadge>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-filter"
          variant="ghost"
          color="neutral"
          size="sm"
        >
          Filter
        </UButton>
        <UButton
          icon="i-lucide-plus"
          variant="solid"
          color="primary"
          size="sm"
        >
          New card
        </UButton>
      </div>
    </header>

    <div class="flex-1 overflow-x-auto">
      <div class="flex gap-4 min-w-max h-full pb-2">
        <div
          v-for="col in columns"
          :key="col.id"
          class="w-80 shrink-0 flex flex-col bg-(--ui-bg-elevated)/50 border border-(--ui-border) rounded-lg"
        >
          <div class="flex items-center justify-between px-3 py-2 border-b border-(--ui-border)">
            <div class="flex items-center gap-2">
              <span
                class="size-2 rounded-full"
                :class="{
                  'bg-(--ui-primary)': col.color === 'primary',
                  'bg-(--ui-success)': col.color === 'success',
                  'bg-(--ui-warning)': col.color === 'warning',
                  'bg-(--ui-info)': col.color === 'info',
                  'bg-(--ui-error)': col.color === 'error',
                  'bg-(--ui-text-muted)': col.color === 'neutral'
                }"
              />
              <h2 class="text-sm font-semibold">
                {{ col.title }}
              </h2>
              <span class="text-xs text-(--ui-text-muted)">
                {{ col.cards.length }}
              </span>
            </div>
            <UButton
              icon="i-lucide-plus"
              variant="ghost"
              color="neutral"
              size="xs"
              :aria-label="`Add card to ${col.title}`"
            />
          </div>

          <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
            <div
              v-for="card in col.cards"
              :key="card.id"
              class="bg-(--ui-bg) border border-(--ui-border) rounded-md p-3 flex flex-col gap-2 hover:border-(--ui-primary) transition-colors cursor-pointer"
            >
              <div class="flex items-start justify-between gap-2">
                <h3 class="text-sm font-medium leading-snug">
                  {{ card.title }}
                </h3>
                <UBadge
                  :color="priorityColor[card.priority]"
                  variant="soft"
                  size="sm"
                  class="capitalize shrink-0"
                >
                  {{ card.priority }}
                </UBadge>
              </div>

              <p
                v-if="card.description"
                class="text-xs text-(--ui-text-muted) line-clamp-2"
              >
                {{ card.description }}
              </p>

              <div
                v-if="card.tags.length"
                class="flex flex-wrap gap-1"
              >
                <UBadge
                  v-for="tag in card.tags"
                  :key="tag"
                  color="neutral"
                  variant="outline"
                  size="sm"
                >
                  {{ tag }}
                </UBadge>
              </div>

              <div class="flex items-center justify-between mt-1">
                <div
                  class="size-6 rounded-full bg-(--ui-bg-elevated) border border-(--ui-border) text-[10px] font-semibold inline-flex items-center justify-center text-(--ui-text-muted)"
                  :title="card.assignee"
                >
                  {{ initials(card.assignee) }}
                </div>
                <div
                  v-if="card.dueDate"
                  class="flex items-center gap-1 text-xs text-(--ui-text-muted)"
                >
                  <UIcon name="i-lucide-calendar" class="size-3" />
                  <span>{{ card.dueDate }}</span>
                </div>
              </div>
            </div>

            <button
              class="text-xs text-(--ui-text-muted) hover:text-(--ui-text) py-2 inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-(--ui-border) hover:border-(--ui-primary) transition-colors"
              type="button"
            >
              <UIcon name="i-lucide-plus" class="size-3.5" />
              Add card
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
