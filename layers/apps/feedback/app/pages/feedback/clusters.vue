<script setup lang="ts">
import {
  CLUSTER_AXES,
  DEFAULT_AXIS,
  getAxis,
  subTypeMeta,
  UNKNOWN_KEY,
  type ClusterContext
} from '../../utils/cluster-axes'
import type {
  KanbanCardModel as Card,
  KanbanColumnModel as Column,
  KanbanProjectModel as Project
} from '../../components/kanban/types'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()

// Per-org reload trigger (mirrors the board page). Single-mode yields null.
const { slug: orgSlug } = useActiveOrg()

// ---------- Data ----------
const projects = ref<Project[]>([])
const columns = ref<Column[]>([])
const cards = ref<Card[]>([])
const assignableUsers = ref<{ id: string, display_name: string | null }[]>([])
const loading = ref(true)
const error = ref('')

// Resolve the workflow columns by name. The accept target is the first
// post-inbox column — "BACKLOG" historically, now "DOING" after the board was
// collapsed. Prefer an explicit BACKLOG if a deployment still has one, else
// fall back to DOING. Archive is always ARCHIVE.
const inboxColumnId = computed(() => columns.value.find(c => c.name === 'FEEDBACK INBOX')?.id ?? '')
const acceptColumnId = computed(() => {
  const backlog = columns.value.find(c => c.name === 'BACKLOG')
  if (backlog) return backlog.id
  return columns.value.find(c => c.name === 'DOING')?.id ?? ''
})
const acceptColumnName = computed(() => {
  const backlog = columns.value.find(c => c.name === 'BACKLOG')
  if (backlog) return 'Backlog'
  return columns.value.some(c => c.name === 'DOING') ? 'Doing' : 'Accept'
})
const archiveColumnId = computed(() => columns.value.find(c => c.name === 'ARCHIVE')?.id ?? '')

const projectNames = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {}
  for (const p of projects.value) out[p.id] = p.name
  return out
})

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [projectsRes, columnsRes, assigneesRes] = await Promise.all([
      $fetch<Project[]>('/api/feedback/projects'),
      $fetch<Column[]>('/api/feedback/columns'),
      $fetch<{ users: { id: string, display_name: string | null }[] }>('/api/feedback/assignees')
        .catch(() => ({ users: [] }))
    ])
    projects.value = projectsRes
    columns.value = columnsRes
    assignableUsers.value = assigneesRes.users

    // Only inbox cards are triaged here. Pull each project's feedback cards,
    // then keep the ones still sitting in FEEDBACK INBOX.
    const inboxId = columnsRes.find(c => c.name === 'FEEDBACK INBOX')?.id ?? ''
    const cardResults = await Promise.all(
      projectsRes.map(p =>
        $fetch<Card[]>('/api/feedback/cards', {
          query: { project_id: p.id, post_type: 'feedback', column_id: inboxId }
        })
      )
    )
    cards.value = cardResults.flat()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load feedback'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
watch(orgSlug, loadAll)

// ---------- Group-by selector ----------
const axisValue = ref(DEFAULT_AXIS)
const axisItems = CLUSTER_AXES.map(a => ({ label: a.label, value: a.value, icon: a.icon }))
const activeAxis = computed(() => getAxis(axisValue.value))

const clusterCtx = computed<ClusterContext>(() => ({ projectNames: projectNames.value }))

// ---------- Facet filters ----------
const facetSubType = ref<'all' | 'bug' | 'idea'>('all')
const subTypeItems = [
  { label: 'All types', value: 'all' },
  { label: 'Bugs only', value: 'bug' },
  { label: 'Ideas only', value: 'idea' }
]
const facetHasAttachment = ref(false)
const facetAnonymousOnly = ref(false)
const facetFrom = ref('')
const facetTo = ref('')

function hasAttachment(card: Card): boolean {
  const m = card.post_meta || {}
  return m.has_screenshot === true || Number(m.attachment_count) > 0
}

function isAnonymous(card: Card): boolean {
  const m = card.post_meta || {}
  if (m.submitter_anonymous === true) return true
  if (m.submitter_anonymous === false) return false
  return !m.submitter_user_id
}

function passesFacets(card: Card): boolean {
  const m = card.post_meta || {}
  if (facetSubType.value !== 'all' && m.feedback_sub_type !== facetSubType.value) return false
  if (facetHasAttachment.value && !hasAttachment(card)) return false
  if (facetAnonymousOnly.value && !isAnonymous(card)) return false
  if (facetFrom.value || facetTo.value) {
    const t = Date.parse(card.created_at)
    if (Number.isNaN(t)) return false
    if (facetFrom.value) {
      const from = Date.parse(facetFrom.value)
      if (!Number.isNaN(from) && t < from) return false
    }
    if (facetTo.value) {
      // Inclusive of the whole "to" day.
      const to = Date.parse(facetTo.value)
      if (!Number.isNaN(to) && t > to + 86_400_000) return false
    }
  }
  return true
}

const filteredCards = computed(() => cards.value.filter(passesFacets))

const activeFacetCount = computed(() => {
  let n = 0
  if (facetSubType.value !== 'all') n++
  if (facetHasAttachment.value) n++
  if (facetAnonymousOnly.value) n++
  if (facetFrom.value || facetTo.value) n++
  return n
})

function clearFacets() {
  facetSubType.value = 'all'
  facetHasAttachment.value = false
  facetAnonymousOnly.value = false
  facetFrom.value = ''
  facetTo.value = ''
}

// ---------- Grouping ----------
interface ClusterGroup {
  key: string
  label: string
  cards: Card[]
  isUnknown: boolean
}

const groups = computed<ClusterGroup[]>(() => {
  const axis = activeAxis.value
  const ctx = clusterCtx.value
  const buckets = new Map<string, Card[]>()
  for (const card of filteredCards.value) {
    const key = axis.keyOf(card, ctx)
    const list = buckets.get(key)
    if (list) list.push(card)
    else buckets.set(key, [card])
  }
  const out: ClusterGroup[] = []
  for (const [key, list] of buckets) {
    list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    out.push({
      key,
      label: axis.groupLabel(key, ctx),
      cards: list,
      isUnknown: key === UNKNOWN_KEY
    })
  }
  // Biggest clusters first — the loudest signals — with unknowns pinned last.
  out.sort((a, b) => {
    if (a.isUnknown !== b.isUnknown) return a.isUnknown ? 1 : -1
    return b.cards.length - a.cards.length
  })
  return out
})

const totalShown = computed(() => filteredCards.value.length)

// ---------- Sparkline (inline SVG, no chart dep) ----------
// Buckets a group's created_at timestamps into N day-buckets spanning the
// group's own min→max range and returns an SVG polyline path. Pure read-time.
const SPARK_W = 96
const SPARK_H = 22
const SPARK_BUCKETS = 12

function sparklinePoints(groupCards: Card[]): string {
  const times = groupCards
    .map(c => Date.parse(c.created_at))
    .filter(t => !Number.isNaN(t))
    .sort((a, b) => a - b)
  if (times.length === 0) return ''
  const min = times[0]!
  const max = times[times.length - 1]!
  const span = max - min
  const counts = new Array(SPARK_BUCKETS).fill(0)
  for (const t of times) {
    const idx = span === 0 ? SPARK_BUCKETS - 1 : Math.min(SPARK_BUCKETS - 1, Math.floor(((t - min) / span) * SPARK_BUCKETS))
    counts[idx]++
  }
  const peak = Math.max(...counts, 1)
  const stepX = SPARK_W / Math.max(1, SPARK_BUCKETS - 1)
  return counts
    .map((c, i) => {
      const x = i * stepX
      const y = SPARK_H - 1 - (c / peak) * (SPARK_H - 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

// ---------- Member row helpers ----------
function memberSubmitter(card: Card): string {
  const m = card.post_meta || {}
  const name = typeof m.submitter_name === 'string' ? m.submitter_name.trim() : ''
  if (name) return name
  const email = typeof m.submitter_email === 'string' ? m.submitter_email.trim() : ''
  if (email) return email
  return 'Anonymous'
}

function memberPagePath(card: Card): string {
  const p = card.post_meta?.page_path
  return typeof p === 'string' ? p : ''
}

function relativeAge(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  return `${months}mo`
}

function fullCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// ---------- Selection ----------
// One flat set of selected card ids across all groups; bulk actions operate on
// it. Cards that scroll out of the current facet view drop from the effective
// selection but stay remembered if the facet is restored.
const selected = ref<Set<string>>(new Set())

function toggleCard(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function groupSelectedCount(group: ClusterGroup): number {
  let n = 0
  for (const c of group.cards) if (selected.value.has(c.id)) n++
  return n
}

function allSelectedInGroup(group: ClusterGroup): boolean {
  return group.cards.length > 0 && group.cards.every(c => selected.value.has(c.id))
}

function toggleGroup(group: ClusterGroup) {
  const next = new Set(selected.value)
  if (allSelectedInGroup(group)) {
    for (const c of group.cards) next.delete(c.id)
  } else {
    for (const c of group.cards) next.add(c.id)
  }
  selected.value = next
}

// Effective selection = selected ids that still pass the current facets.
const visibleIds = computed(() => new Set(filteredCards.value.map(c => c.id)))
const effectiveSelection = computed(() =>
  [...selected.value].filter(id => visibleIds.value.has(id))
)
const selectionCount = computed(() => effectiveSelection.value.length)

function clearSelection() {
  selected.value = new Set()
}

// ---------- Bulk actions ----------
const bulkBusy = ref(false)

async function applyBulkMove(columnId: string, columnLabel: string) {
  const ids = effectiveSelection.value
  if (ids.length === 0 || !columnId) return
  bulkBusy.value = true
  try {
    const res = await $fetch<{ count: number }>('/api/feedback/cards/bulk-move', {
      method: 'PATCH',
      body: { ids, column_id: columnId }
    })
    // Moved cards leave the inbox view; drop them locally.
    const moved = new Set(ids)
    cards.value = cards.value.filter(c => !moved.has(c.id))
    clearSelection()
    toast.add({ title: `Moved ${res.count} to ${columnLabel}`, color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Bulk move failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    bulkBusy.value = false
  }
}

const assignOpen = ref(false)
const assignUserId = ref<string | null>(null)
const userItems = computed(() =>
  assignableUsers.value.map(u => ({ id: u.id, label: u.display_name || 'Unnamed user' }))
)

async function applyBulkAssign() {
  const ids = effectiveSelection.value
  if (ids.length === 0) return
  const target = assignableUsers.value.find(u => u.id === assignUserId.value)
  const assignee = target ? (target.display_name || target.id) : null
  bulkBusy.value = true
  try {
    const res = await $fetch<{ count: number }>('/api/feedback/cards/bulk-move', {
      method: 'PATCH',
      body: { ids, assignee }
    })
    // Reflect the new assignee locally; cards stay in the inbox.
    const idSet = new Set(ids)
    cards.value = cards.value.map(c => (idSet.has(c.id) ? { ...c, assignee } : c))
    assignOpen.value = false
    assignUserId.value = null
    toast.add({ title: `Assigned ${res.count} card${res.count === 1 ? '' : 's'}`, color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Bulk assign failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    bulkBusy.value = false
  }
}

// Collapsed-state per group key (UI only — never persisted). Defaults open.
const collapsedKeys = ref<Set<string>>(new Set())
function isOpen(key: string): boolean {
  return !collapsedKeys.value.has(key)
}
function setOpen(key: string, open: boolean) {
  const next = new Set(collapsedKeys.value)
  if (open) next.delete(key)
  else next.add(key)
  collapsedKeys.value = next
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- Header -->
    <div class="shrink-0 bg-(--ui-bg-elevated) border-b border-(--ui-border) px-4 py-2 flex items-center gap-3">
      <UIcon name="i-lucide-layers" class="shrink-0" />
      <div class="min-w-0">
        <h1 class="font-semibold truncate text-sm sm:text-base">Signal Clusters</h1>
        <p class="text-[11px] text-(--ui-text-muted) leading-tight hidden sm:block">
          Triage the feedback inbox by pattern
        </p>
      </div>

      <div class="ml-auto flex items-center gap-2 shrink-0">
        <span class="text-[11px] text-(--ui-text-muted) hidden md:inline">Group by</span>
        <USelect
          v-model="axisValue"
          :items="axisItems"
          value-key="value"
          icon="i-lucide-layers"
          size="sm"
          class="w-44"
        />
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-refresh-ccw"
          aria-label="Reload"
          :loading="loading"
          @click="loadAll"
        />
      </div>
    </div>

    <div class="flex-1 min-h-0 flex">
      <!-- Facet rail -->
      <aside class="w-60 shrink-0 border-r border-(--ui-border) bg-(--ui-bg-muted) overflow-y-auto hidden lg:flex flex-col">
        <div class="p-4 space-y-5">
          <div class="flex items-center justify-between">
            <h2 class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">Filters</h2>
            <UButton
              v-if="activeFacetCount > 0"
              variant="link"
              size="xs"
              color="neutral"
              @click="clearFacets"
            >
              Clear ({{ activeFacetCount }})
            </UButton>
          </div>

          <div class="space-y-1.5">
            <label class="text-[11px] font-medium text-(--ui-text-muted)">Sub-type</label>
            <USelect
              v-model="facetSubType"
              :items="subTypeItems"
              value-key="value"
              size="sm"
              class="w-full"
            />
          </div>

          <div class="space-y-2">
            <UCheckbox v-model="facetHasAttachment" label="Has screenshot / attachment" size="sm" />
            <UCheckbox v-model="facetAnonymousOnly" label="Anonymous only" size="sm" />
          </div>

          <div class="space-y-1.5">
            <label class="text-[11px] font-medium text-(--ui-text-muted)">Submitted on or after</label>
            <UInput v-model="facetFrom" type="date" size="sm" class="w-full" />
          </div>
          <div class="space-y-1.5">
            <label class="text-[11px] font-medium text-(--ui-text-muted)">Submitted on or before</label>
            <UInput v-model="facetTo" type="date" size="sm" class="w-full" />
          </div>
        </div>

        <div class="mt-auto p-4 border-t border-(--ui-border) text-[11px] text-(--ui-text-muted)">
          {{ totalShown }} of {{ cards.length }} inbox item{{ cards.length === 1 ? '' : 's' }}
        </div>
      </aside>

      <!-- Main column -->
      <div class="flex-1 min-h-0 flex flex-col">
        <!-- Bulk action bar -->
        <Transition name="fade">
          <div
            v-if="selectionCount > 0"
            class="shrink-0 bg-(--ui-bg-elevated) border-b border-(--ui-border) px-4 py-2 flex items-center gap-2 flex-wrap"
          >
            <span class="text-sm font-medium">{{ selectionCount }} selected</span>
            <div class="flex items-center gap-2 ml-2 flex-wrap">
              <UButton
                size="sm"
                color="primary"
                icon="i-lucide-check"
                :loading="bulkBusy"
                :disabled="!acceptColumnId"
                @click="applyBulkMove(acceptColumnId, acceptColumnName)"
              >
                Accept to {{ acceptColumnName }}
              </UButton>
              <UButton
                size="sm"
                variant="soft"
                color="neutral"
                icon="i-lucide-user-plus"
                :loading="bulkBusy"
                @click="assignOpen = true"
              >
                Assign
              </UButton>
              <UButton
                size="sm"
                variant="soft"
                color="warning"
                icon="i-lucide-archive"
                :loading="bulkBusy"
                :disabled="!archiveColumnId"
                @click="applyBulkMove(archiveColumnId, 'Archive')"
              >
                Archive
              </UButton>
            </div>
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              class="ml-auto"
              @click="clearSelection"
            >
              Clear
            </UButton>
          </div>
        </Transition>

        <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <UAlert v-if="error" color="error" :title="error" />

          <div v-if="loading" class="py-12 text-center text-(--ui-text-muted)">
            Loading feedback…
          </div>

          <div v-else-if="cards.length === 0" class="py-16 text-center">
            <UIcon name="i-lucide-inbox" class="w-10 h-10 text-(--ui-text-muted) mx-auto mb-3" />
            <p class="text-(--ui-text-muted)">The feedback inbox is empty.</p>
          </div>

          <div v-else-if="groups.length === 0" class="py-16 text-center">
            <p class="text-(--ui-text-muted)">No inbox items match the current filters.</p>
            <UButton class="mt-3" variant="soft" size="sm" @click="clearFacets">Clear filters</UButton>
          </div>

          <!-- Cluster panels -->
          <div
            v-for="group in groups"
            v-else
            :key="group.key"
            class="rounded-lg border border-(--ui-border) bg-(--ui-bg) overflow-hidden"
          >
            <UCollapsible
              :open="isOpen(group.key)"
              @update:open="(v: boolean) => setOpen(group.key, v)"
            >
              <!-- Panel header -->
              <div class="flex items-center gap-3 px-3 py-2.5 bg-(--ui-bg-elevated)">
                <UCheckbox
                  :model-value="allSelectedInGroup(group) ? true : (groupSelectedCount(group) > 0 ? 'indeterminate' : false)"
                  aria-label="Select all in group"
                  @update:model-value="toggleGroup(group)"
                  @click.stop
                />
                <button
                  type="button"
                  class="flex items-center gap-2 min-w-0 flex-1 text-left"
                  @click="setOpen(group.key, !isOpen(group.key))"
                >
                  <UIcon
                    :name="isOpen(group.key) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="w-4 h-4 shrink-0 text-(--ui-text-muted)"
                  />
                  <UIcon :name="activeAxis.icon" class="w-4 h-4 shrink-0 text-(--ui-text-muted)" />
                  <span
                    class="font-medium truncate"
                    :class="group.isUnknown ? 'text-(--ui-text-muted) italic' : ''"
                    :title="group.label"
                  >{{ group.label }}</span>
                  <UBadge
                    :label="group.cards.length"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    class="shrink-0"
                  />
                  <span
                    v-if="groupSelectedCount(group) > 0"
                    class="text-[11px] text-(--ui-primary) shrink-0"
                  >{{ groupSelectedCount(group) }} selected</span>
                </button>

                <!-- Sparkline of submissions over time -->
                <svg
                  :width="SPARK_W"
                  :height="SPARK_H"
                  class="shrink-0 hidden sm:block text-(--ui-primary)"
                  :aria-label="`Submission trend (${group.cards.length})`"
                  role="img"
                >
                  <polyline
                    :points="sparklinePoints(group.cards)"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                </svg>
              </div>

              <template #content>
                <ul class="divide-y divide-(--ui-border)">
                  <li
                    v-for="card in group.cards"
                    :key="card.id"
                    class="flex items-center gap-3 px-3 py-2 hover:bg-(--ui-bg-elevated) transition-colors"
                    :class="selected.has(card.id) ? 'bg-(--ui-bg-accented)/40' : ''"
                  >
                    <UCheckbox
                      :model-value="selected.has(card.id)"
                      aria-label="Select card"
                      @update:model-value="toggleCard(card.id)"
                    />
                    <UIcon
                      :name="subTypeMeta(card).icon"
                      class="w-4 h-4 shrink-0 text-(--ui-text-muted)"
                      :title="subTypeMeta(card).label"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="text-sm truncate" :title="card.title">{{ card.title || '(Untitled)' }}</p>
                      <div class="flex items-center gap-2 text-[11px] text-(--ui-text-muted) min-w-0">
                        <span class="inline-flex items-center gap-1 min-w-0 shrink truncate">
                          <UIcon name="i-lucide-user" class="w-3 h-3 shrink-0" />
                          <span class="truncate">{{ memberSubmitter(card) }}</span>
                        </span>
                        <span
                          v-if="memberPagePath(card)"
                          class="inline-flex items-center gap-1 min-w-0 shrink truncate"
                          :title="memberPagePath(card)"
                        >
                          <UIcon name="i-lucide-link" class="w-3 h-3 shrink-0" />
                          <span class="truncate">{{ memberPagePath(card) }}</span>
                        </span>
                        <span v-if="card.assignee" class="inline-flex items-center gap-1 shrink-0">
                          <UIcon name="i-lucide-user-check" class="w-3 h-3" />
                          <span class="truncate max-w-24">{{ card.assignee }}</span>
                        </span>
                      </div>
                    </div>
                    <span
                      class="text-[11px] text-(--ui-text-muted) shrink-0 tabular-nums"
                      :title="fullCreated(card.created_at)"
                    >{{ relativeAge(card.created_at) }}</span>
                  </li>
                </ul>
              </template>
            </UCollapsible>
          </div>
        </div>
      </div>
    </div>

    <!-- Assign modal -->
    <UModal v-model:open="assignOpen" title="Assign selected cards">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-(--ui-text-muted)">
            Assign {{ selectionCount }} selected card{{ selectionCount === 1 ? '' : 's' }} to a teammate.
          </p>
          <UFormField label="Assignee">
            <USelectMenu
              v-model="assignUserId"
              :items="userItems"
              value-key="id"
              label-key="label"
              :search-input="{ placeholder: 'Search users...' }"
              placeholder="Unassigned"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="assignOpen = false">Cancel</UButton>
          <UButton :loading="bulkBusy" @click="applyBulkAssign">Assign</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
