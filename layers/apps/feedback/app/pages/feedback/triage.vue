<script setup lang="ts">
import type {
  KanbanCardModel as Card,
  KanbanColumnModel as Column,
  KanbanProjectModel as Project
} from '../../components/kanban/types'
import {
  REJECT_REASONS,
  SPAM_REASONS,
  SNOOZE_PRESETS,
  reasonLabel,
  relativeAge
} from '../../utils/triage'

definePageMeta({
  middleware: 'auth'
})

const toast = useToast()

// Inbox triage sits in front of the kanban board: it reads the FEEDBACK INBOX
// column and disposes of each item (accept → first working column, reject/spam
// → ARCHIVE, snooze → out of list until a time). Only accepted items become
// board cards.
const INBOX_COLUMN = 'FEEDBACK INBOX'
const ARCHIVE_COLUMN = 'ARCHIVE'
// Accept lands a card on the first working column past the inbox. The seed
// board calls it BACKLOG; a later migration collapsed BACKLOG into DOING, so
// resolve to whichever the deployment actually has, preferring BACKLOG.
const ACCEPT_COLUMN_CANDIDATES = ['BACKLOG', 'DOING'] as const

// Scope key mirrors the board page so any future per-org UI state stays
// separate across org switches.
const { slug: orgSlug } = useActiveOrg()

const projects = ref<Project[]>([])
const columns = ref<Column[]>([])
const cards = ref<Card[]>([])
const assignableUsers = ref<{ id: string, display_name: string | null }[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref(false)

// Re-evaluated each second so relative ages and snooze expiry stay live without
// a refetch.
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null

const columnByName = computed(() => {
  const m = new Map<string, Column>()
  for (const c of columns.value) m.set(c.name, c)
  return m
})
const projectName = (id: string) => projects.value.find(p => p.id === id)?.name ?? ''

// First available accept target by preference order (BACKLOG, else DOING).
const acceptColumn = computed<Column | undefined>(() => {
  for (const name of ACCEPT_COLUMN_CANDIDATES) {
    const col = columnByName.value.get(name)
    if (col) return col
  }
  return undefined
})
const acceptColumnLabel = computed(() => acceptColumn.value?.name ?? 'Backlog')

// ---------- Loading ----------
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
    await loadCards()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load inbox'
  } finally {
    loading.value = false
  }
}

async function loadCards() {
  const inbox = columnByName.value.get(INBOX_COLUMN)
  if (!inbox) {
    cards.value = []
    return
  }
  const results = await Promise.all(
    projects.value.map(p =>
      $fetch<Card[]>('/api/feedback/cards', {
        query: { project_id: p.id, column_id: inbox.id, post_type: 'feedback' }
      })
    )
  )
  // Newest first — the cards GET already returns created_at desc per project;
  // merge across projects and re-sort to keep a single global order.
  cards.value = results
    .flat()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

// Snoozed items drop out of the inbox until their snoozed_until passes.
function snoozedUntil(card: Card): number {
  const v = card.post_meta?.snoozed_until
  if (typeof v !== 'string' || !v) return 0
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}

const visibleCards = computed(() =>
  cards.value.filter(c => snoozedUntil(c) <= now.value)
)
const snoozedCount = computed(() =>
  cards.value.filter(c => snoozedUntil(c) > now.value).length
)

// ---------- Selection ----------
const selectedId = ref<string | null>(null)
const selected = computed(() => visibleCards.value.find(c => c.id === selectedId.value) ?? null)
const selectedIndex = computed(() => visibleCards.value.findIndex(c => c.id === selectedId.value))

// Keep a valid selection as the list changes (item disposed/snoozed): fall to
// the item that took the disposed one's slot, else the previous, else nothing.
function reconcileSelection(prevIndex: number) {
  const list = visibleCards.value
  if (list.length === 0) {
    selectedId.value = null
    return
  }
  if (selectedId.value && list.some(c => c.id === selectedId.value)) return
  const next = Math.min(prevIndex, list.length - 1)
  selectedId.value = list[Math.max(0, next)]?.id ?? null
}

function select(card: Card) {
  selectedId.value = card.id
}
function move(delta: number) {
  const list = visibleCards.value
  if (list.length === 0) return
  const idx = selectedIndex.value
  const next = idx < 0 ? 0 : Math.min(list.length - 1, Math.max(0, idx + delta))
  selectedId.value = list[next]?.id ?? null
  nextTick(scrollSelectedIntoView)
}

function scrollSelectedIntoView() {
  if (!import.meta.client || !selectedId.value) return
  const el = document.querySelector(`[data-row-id="${selectedId.value}"]`)
  el?.scrollIntoView({ block: 'nearest' })
}

// ---------- Per-card derived display ----------
// Accept a nullable card so the reading pane (guarded at runtime by v-if) can
// call these without the template narrowing `selected` to non-null for TS.
type MaybeCard = Card | null | undefined

function subType(card: MaybeCard): 'bug' | 'idea' {
  return card?.post_meta?.feedback_sub_type === 'idea' ? 'idea' : 'bug'
}
function submitter(card: MaybeCard): string {
  const pm = card?.post_meta || {}
  const name = pm.submitter_name
  if (name && String(name).trim()) return String(name).trim()
  const email = pm.submitter_email
  if (email && String(email).trim()) return String(email).trim()
  return 'Anonymous'
}
function pagePath(card: MaybeCard): string {
  const p = card?.post_meta?.page_path
  return typeof p === 'string' ? p : ''
}
function clientCtx(card: MaybeCard, key: string): string {
  const ctx = card?.post_meta?.client_context
  if (!ctx || typeof ctx !== 'object') return ''
  const v = (ctx as Record<string, any>)[key]
  return v === undefined || v === null ? '' : String(v)
}
function deviceIcon(card: MaybeCard): string {
  return clientCtx(card, 'is_mobile') === 'true' || card?.post_meta?.client_context?.is_mobile
    ? 'i-lucide-smartphone'
    : 'i-lucide-monitor'
}
function attachmentCount(card: MaybeCard): number {
  const n = card?.post_meta?.attachment_count
  const hasShot = card?.post_meta?.has_screenshot ? 1 : 0
  return (typeof n === 'number' ? n : 0) + hasShot
}
function deviceSummary(card: MaybeCard): string {
  const parts = [
    clientCtx(card, 'device_type'),
    clientCtx(card, 'platform'),
    clientCtx(card, 'browser')
  ].filter(Boolean)
  return parts.join(' · ')
}

// ---------- Attachments (reading pane) — mirrors CardEditSidePanel ----------
interface FeedbackAttachment {
  id: string
  kind: 'screenshot' | 'attachment'
  filename: string
  mime_type: string
  size_bytes: number
  url: string
}
const attachments = ref<FeedbackAttachment[]>([])
const attachmentsLoading = ref(false)
const attachmentsError = ref('')

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
function isImage(mime: string) { return typeof mime === 'string' && mime.startsWith('image/') }

const screenshotAttachments = computed(() => attachments.value.filter(a => a.kind === 'screenshot'))
const fileAttachments = computed(() => attachments.value.filter(a => a.kind === 'attachment'))

async function loadAttachments(cardId: string) {
  attachments.value = []
  attachmentsError.value = ''
  attachmentsLoading.value = true
  try {
    const rows = await $fetch<FeedbackAttachment[]>(
      `/api/admin/feedback/${encodeURIComponent(cardId)}/attachments`
    )
    attachments.value = Array.isArray(rows) ? rows : []
  } catch (err: any) {
    attachmentsError.value = err?.data?.statusMessage || err?.message || 'Failed to load attachments'
  } finally {
    attachmentsLoading.value = false
  }
}

watch(selectedId, (id) => {
  if (id) loadAttachments(id)
  else { attachments.value = []; attachmentsError.value = '' }
})

// Lightbox modal for image attachments (mirrors CardEditSidePanel).
const lightboxOpen = ref(false)
const lightboxUrl = ref('')
const lightboxAlt = ref('')
function openLightbox(a: FeedbackAttachment) {
  lightboxUrl.value = a.url
  lightboxAlt.value = a.filename
  lightboxOpen.value = true
}

// ---------- Inline accept controls ----------
const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Highest', value: 'highest' }
]
const acceptPriority = ref<string | undefined>(undefined)
const acceptAssignee = ref<string | undefined>(undefined)
const assigneeOptions = computed<string[]>(() =>
  assignableUsers.value.map(u => u.display_name).filter((n): n is string => !!n)
)

// Reset the inline accept controls whenever the selection changes so one item's
// chosen priority/assignee never bleeds into the next.
watch(selectedId, () => {
  acceptPriority.value = undefined
  acceptAssignee.value = undefined
})

// ---------- Disposition actions ----------
// PATCH post_meta (merged) then move the card to a target column. Optimistic:
// the card leaves the inbox list immediately; on failure we reload.
async function dispose(
  card: Card,
  targetColumnName: string,
  metaPatch: Record<string, any>
) {
  const target = columnByName.value.get(targetColumnName)
  if (!target) {
    toast.add({ title: `${targetColumnName} column missing`, color: 'error' })
    return
  }
  busy.value = true
  const prevIndex = selectedIndex.value
  const idx = cards.value.findIndex(c => c.id === card.id)
  const snapshot = idx >= 0 ? cards.value[idx]! : null
  // Drop from the local list right away.
  if (idx >= 0) cards.value.splice(idx, 1)
  reconcileSelection(prevIndex)
  try {
    const mergedMeta = { ...(card.post_meta ?? {}), ...metaPatch }
    // Persist the disposition metadata first, then move columns.
    await $fetch<Card>(`/api/feedback/cards/${card.id}`, {
      method: 'PATCH',
      body: { post_meta: mergedMeta }
    })
    await $fetch<Card>(`/api/feedback/cards/${card.id}/move`, {
      method: 'PATCH',
      body: { column_id: target.id }
    })
  } catch (e: any) {
    // Restore on failure and reload to resync.
    if (snapshot) cards.value.splice(Math.min(idx, cards.value.length), 0, snapshot)
    toast.add({ title: 'Action failed', description: e?.data?.statusMessage, color: 'error' })
    await loadCards()
  } finally {
    busy.value = false
  }
}

async function accept(card: MaybeCard) {
  if (!card) return
  const metaPatch: Record<string, any> = {
    triage_outcome: 'accepted',
    triaged_at: new Date().toISOString()
  }
  if (acceptPriority.value) metaPatch.priority_qualitative = acceptPriority.value
  // Accept also writes priority / assignee as first-class card columns so the
  // board card surfaces them, not only post_meta.
  const body: Record<string, any> = {
    post_meta: { ...(card.post_meta ?? {}), ...metaPatch }
  }
  if (acceptPriority.value) body.priority = acceptPriority.value
  if (acceptAssignee.value) body.assignee = acceptAssignee.value

  const target = acceptColumn.value
  if (!target) {
    toast.add({ title: 'No accept column (BACKLOG/DOING) found', color: 'error' })
    return
  }
  busy.value = true
  const prevIndex = selectedIndex.value
  const idx = cards.value.findIndex(c => c.id === card.id)
  const snapshot = idx >= 0 ? cards.value[idx]! : null
  if (idx >= 0) cards.value.splice(idx, 1)
  reconcileSelection(prevIndex)
  try {
    await $fetch<Card>(`/api/feedback/cards/${card.id}`, { method: 'PATCH', body })
    await $fetch<Card>(`/api/feedback/cards/${card.id}/move`, {
      method: 'PATCH',
      body: { column_id: target.id }
    })
    toast.add({ title: `Accepted → ${target.name}`, icon: 'i-lucide-check', color: 'success' })
  } catch (e: any) {
    if (snapshot) cards.value.splice(Math.min(idx, cards.value.length), 0, snapshot)
    toast.add({ title: 'Accept failed', description: e?.data?.statusMessage, color: 'error' })
    await loadCards()
  } finally {
    busy.value = false
  }
}

// ---------- Reject / Spam (reason pickers) ----------
const rejectOpen = ref(false)
const spamOpen = ref(false)
const rejectReason = ref<string>('')
const spamReason = ref<string>('')
const pendingCard = ref<Card | null>(null)

function openReject(card: MaybeCard) {
  if (!card) return
  pendingCard.value = card
  rejectReason.value = ''
  rejectOpen.value = true
}
function openSpam(card: MaybeCard) {
  if (!card) return
  pendingCard.value = card
  spamReason.value = ''
  spamOpen.value = true
}
async function confirmReject() {
  const card = pendingCard.value
  if (!card || !rejectReason.value) return
  rejectOpen.value = false
  await dispose(card, ARCHIVE_COLUMN, {
    triage_outcome: 'rejected',
    triage_reason: rejectReason.value,
    triaged_at: new Date().toISOString()
  })
  toast.add({ title: `Rejected — ${reasonLabel('rejected', rejectReason.value)}`, color: 'neutral' })
}
async function confirmSpam() {
  const card = pendingCard.value
  if (!card || !spamReason.value) return
  spamOpen.value = false
  await dispose(card, ARCHIVE_COLUMN, {
    triage_outcome: 'spam',
    triage_reason: spamReason.value,
    triaged_at: new Date().toISOString()
  })
  toast.add({ title: `Marked spam — ${reasonLabel('spam', spamReason.value)}`, color: 'neutral' })
}

// ---------- Snooze ----------
async function snooze(card: Card, ms: number, label: string) {
  const until = new Date(Date.now() + ms).toISOString()
  busy.value = true
  const prevIndex = selectedIndex.value
  const i = cards.value.findIndex(c => c.id === card.id)
  const snapshot = i >= 0 ? cards.value[i]! : null
  // Write the new snoozed_until locally so the card drops out immediately.
  if (i >= 0) {
    cards.value.splice(i, 1, {
      ...card,
      post_meta: { ...(card.post_meta ?? {}), snoozed_until: until }
    })
  }
  reconcileSelection(prevIndex)
  try {
    await $fetch<Card>(`/api/feedback/cards/${card.id}`, {
      method: 'PATCH',
      body: { post_meta: { ...(card.post_meta ?? {}), snoozed_until: until } }
    })
    toast.add({ title: `Snoozed ${label.toLowerCase()}`, icon: 'i-lucide-alarm-clock', color: 'neutral' })
  } catch (e: any) {
    if (snapshot && i >= 0) cards.value.splice(i, 1, snapshot)
    toast.add({ title: 'Snooze failed', description: e?.data?.statusMessage, color: 'error' })
    await loadCards()
  } finally {
    busy.value = false
  }
}

// ---------- Keyboard ----------
const showShortcuts = ref(false)

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function onKeydown(e: KeyboardEvent) {
  // Don't hijack typing in a field or while a reason dialog is open.
  if (isTypingTarget(e.target) || rejectOpen.value || spamOpen.value || lightboxOpen.value) return
  const card = selected.value
  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      e.preventDefault(); move(1); break
    case 'k':
    case 'ArrowUp':
      e.preventDefault(); move(-1); break
    case 'e':
      if (card && !busy.value) { e.preventDefault(); accept(card) }
      break
    case '#':
      if (card && !busy.value) { e.preventDefault(); openReject(card) }
      break
    case '?':
      e.preventDefault(); showShortcuts.value = !showShortcuts.value; break
    default:
      break
  }
}

onMounted(() => {
  loadAll().then(() => {
    if (!selectedId.value && visibleCards.value.length) {
      selectedId.value = visibleCards.value[0]!.id
    }
  })
  if (import.meta.client) {
    window.addEventListener('keydown', onKeydown)
    nowTimer = setInterval(() => { now.value = Date.now() }, 1000)
  }
})
onUnmounted(() => {
  if (import.meta.client) window.removeEventListener('keydown', onKeydown)
  if (nowTimer) clearInterval(nowTimer)
})
watch(orgSlug, () => {
  selectedId.value = null
  loadAll()
})

// Reading-pane helpers for the selected card.
const selProblem = computed(() => String(selected.value?.post_meta?.problem_description ?? ''))
const selFix = computed(() => String(selected.value?.post_meta?.suggested_fix ?? ''))
const selPageUrl = computed(() => String(selected.value?.post_meta?.page_url ?? ''))
const selSubmittedAt = computed(() => {
  const iso = selected.value?.post_meta?.submitted_at || selected.value?.created_at
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
})
const selEmail = computed(() => {
  const e = selected.value?.post_meta?.submitter_email
  return e ? String(e) : ''
})
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <!-- Header -->
    <div class="shrink-0 bg-(--ui-bg-elevated) border-b border-(--ui-border) px-4 py-2 flex items-center gap-3">
      <UIcon name="i-lucide-inbox" class="shrink-0" />
      <h1 class="font-semibold text-sm sm:text-base">Triage</h1>
      <UBadge color="neutral" variant="subtle" size="sm">
        {{ visibleCards.length }} in inbox
      </UBadge>
      <UBadge v-if="snoozedCount" color="warning" variant="subtle" size="sm">
        {{ snoozedCount }} snoozed
      </UBadge>

      <div class="ml-auto flex items-center gap-2">
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-keyboard"
          :aria-label="showShortcuts ? 'Hide shortcuts' : 'Show shortcuts'"
          @click="showShortcuts = !showShortcuts"
        />
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-refresh-ccw"
          aria-label="Reload"
          @click="loadAll"
        />
        <UButton variant="soft" size="sm" icon="i-lucide-layout-dashboard" to="/feedback">
          Board
        </UButton>
      </div>
    </div>

    <!-- Shortcuts hint bar -->
    <div
      v-if="showShortcuts"
      class="shrink-0 bg-(--ui-bg-muted) border-b border-(--ui-border) px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-(--ui-text-muted)"
    >
      <span><kbd class="font-mono text-(--ui-text)">j</kbd>/<kbd class="font-mono text-(--ui-text)">k</kbd> move</span>
      <span><kbd class="font-mono text-(--ui-text)">e</kbd> accept</span>
      <span><kbd class="font-mono text-(--ui-text)">#</kbd> reject</span>
      <span><kbd class="font-mono text-(--ui-text)">?</kbd> toggle this bar</span>
    </div>

    <UAlert v-if="error" color="error" :title="error" class="m-4" />

    <div v-if="loading" class="py-12 text-center text-(--ui-text-muted)">
      Loading inbox…
    </div>

    <div v-else class="flex-1 min-h-0 flex">
      <!-- Left: dense reading list -->
      <div class="w-full sm:w-[380px] lg:w-[440px] shrink-0 border-r border-(--ui-border) overflow-y-auto bg-(--ui-bg)">
        <div v-if="visibleCards.length === 0" class="py-12 px-4 text-center text-(--ui-text-muted)">
          <UIcon name="i-lucide-inbox" class="text-3xl mb-2 opacity-50" />
          <p class="text-sm">Inbox zero. Nothing to triage.</p>
        </div>
        <ul v-else class="divide-y divide-(--ui-border)">
          <li
            v-for="c in visibleCards"
            :key="c.id"
            :data-row-id="c.id"
            class="px-3 py-2 cursor-pointer transition-colors"
            :class="c.id === selectedId
              ? 'bg-(--ui-bg-accented)'
              : 'hover:bg-(--ui-bg-elevated)'"
            @click="select(c)"
          >
            <div class="flex items-start gap-2">
              <UIcon
                :name="subType(c) === 'idea' ? 'i-lucide-lightbulb' : 'i-lucide-bug'"
                class="mt-0.5 shrink-0"
                :class="subType(c) === 'idea' ? 'text-amber-500' : 'text-red-500'"
                :title="subType(c) === 'idea' ? 'Idea' : 'Bug'"
              />
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium line-clamp-2 leading-snug">
                  {{ c.title || '(Untitled)' }}
                </div>
                <div class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-(--ui-text-muted)">
                  <span class="inline-flex items-center gap-1 min-w-0">
                    <UIcon name="i-lucide-user" class="w-3 h-3 shrink-0" />
                    <span class="truncate max-w-[120px]">{{ submitter(c) }}</span>
                  </span>
                  <span v-if="pagePath(c)" class="inline-flex items-center gap-1 min-w-0" :title="pagePath(c)">
                    <UIcon name="i-lucide-file" class="w-3 h-3 shrink-0" />
                    <span class="truncate max-w-[120px] font-mono">{{ pagePath(c) }}</span>
                  </span>
                  <UIcon :name="deviceIcon(c)" class="w-3 h-3 shrink-0" :title="deviceSummary(c) || 'Device'" />
                  <span v-if="attachmentCount(c)" class="inline-flex items-center gap-0.5 shrink-0" :title="`${attachmentCount(c)} attachment(s)`">
                    <UIcon name="i-lucide-paperclip" class="w-3 h-3" />{{ attachmentCount(c) }}
                  </span>
                  <span class="ml-auto shrink-0 tabular-nums" :title="new Date(c.created_at).toLocaleString()">
                    {{ relativeAge(c.created_at) }}
                  </span>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <!-- Right: reading pane + action bar -->
      <div class="flex-1 min-h-0 hidden sm:flex flex-col bg-(--ui-bg-muted)">
        <div v-if="!selected" class="flex-1 flex items-center justify-center text-(--ui-text-muted) text-sm">
          Select an item to read it.
        </div>

        <template v-else>
          <!-- Scrollable detail -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <!-- Title + meta -->
            <div>
              <div class="flex items-center gap-2 mb-2">
                <UBadge
                  :color="subType(selected) === 'idea' ? 'warning' : 'error'"
                  variant="subtle"
                  size="sm"
                >
                  <UIcon :name="subType(selected) === 'idea' ? 'i-lucide-lightbulb' : 'i-lucide-bug'" class="mr-1" />
                  {{ subType(selected) === 'idea' ? 'Idea' : 'Bug' }}
                </UBadge>
                <span class="text-xs text-(--ui-text-muted)">{{ projectName(selected?.project_id ?? '') }}</span>
              </div>
              <h2 class="text-lg font-semibold leading-snug">{{ selected?.title || '(Untitled)' }}</h2>
            </div>

            <!-- Submitter + context bar -->
            <section class="space-y-1.5 text-sm">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-(--ui-text-muted)">
                <span class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-user" class="shrink-0" />
                  <span class="text-(--ui-text)">{{ submitter(selected) }}</span>
                  <span v-if="selEmail" class="text-(--ui-text-muted)">· {{ selEmail }}</span>
                </span>
                <span v-if="selSubmittedAt" class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-calendar" class="shrink-0" />
                  <span>{{ selSubmittedAt }}</span>
                </span>
                <span v-if="deviceSummary(selected)" class="inline-flex items-center gap-1.5">
                  <UIcon :name="deviceIcon(selected)" class="shrink-0" />
                  <span>{{ deviceSummary(selected) }}</span>
                </span>
              </div>
              <a
                v-if="selPageUrl"
                :href="selPageUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 text-(--ui-primary) hover:underline break-all"
              >
                <UIcon name="i-lucide-external-link" class="shrink-0" />
                <span>{{ selPageUrl }}</span>
              </a>
            </section>

            <!-- Problem / suggested fix, ordered by sub-type -->
            <section class="space-y-4 pt-4 border-t border-(--ui-border)">
              <template v-if="subType(selected) === 'idea'">
                <div v-if="selFix">
                  <h3 class="text-xs font-semibold text-(--ui-text-muted) uppercase tracking-wide mb-1">Idea</h3>
                  <p class="text-sm whitespace-pre-wrap">{{ selFix }}</p>
                </div>
                <div v-if="selProblem">
                  <h3 class="text-xs font-semibold text-(--ui-text-muted) uppercase tracking-wide mb-1">Problem it solves</h3>
                  <p class="text-sm whitespace-pre-wrap">{{ selProblem }}</p>
                </div>
              </template>
              <template v-else>
                <div v-if="selProblem">
                  <h3 class="text-xs font-semibold text-(--ui-text-muted) uppercase tracking-wide mb-1">Problem</h3>
                  <p class="text-sm whitespace-pre-wrap">{{ selProblem }}</p>
                </div>
                <div v-if="selFix">
                  <h3 class="text-xs font-semibold text-(--ui-text-muted) uppercase tracking-wide mb-1">Suggested fix</h3>
                  <p class="text-sm whitespace-pre-wrap">{{ selFix }}</p>
                </div>
              </template>
            </section>

            <!-- Attachments -->
            <section class="space-y-3 pt-4 border-t border-(--ui-border)">
              <h3 class="text-xs font-semibold text-(--ui-text-muted) uppercase tracking-wide">Attachments</h3>
              <div v-if="attachmentsLoading" class="text-sm text-(--ui-text-muted) italic">Loading…</div>
              <div v-else-if="attachmentsError" class="text-sm text-(--ui-error)">{{ attachmentsError }}</div>
              <div v-else-if="!attachments.length" class="text-sm text-(--ui-text-muted) italic">
                No screenshots or files attached.
              </div>
              <div v-else class="space-y-3">
                <div v-if="screenshotAttachments.length" class="flex flex-wrap gap-2">
                  <button
                    v-for="a in screenshotAttachments"
                    :key="a.id"
                    type="button"
                    class="block w-40 rounded border border-(--ui-border) overflow-hidden hover:border-(--ui-primary) transition-colors text-left cursor-zoom-in"
                    :title="`${a.filename} · ${formatBytes(a.size_bytes)}`"
                    @click="openLightbox(a)"
                  >
                    <img :src="a.url" :alt="a.filename" class="w-full h-28 object-cover bg-(--ui-bg-muted)" />
                    <div class="px-2 py-1 text-xs truncate">{{ a.filename }}</div>
                  </button>
                </div>
                <ul v-if="fileAttachments.length" class="space-y-1">
                  <li v-for="a in fileAttachments" :key="a.id">
                    <button
                      v-if="isImage(a.mime_type)"
                      type="button"
                      class="flex w-full items-center gap-2 px-2 py-1.5 rounded border border-(--ui-border) hover:border-(--ui-primary) transition-colors text-left cursor-zoom-in"
                      @click="openLightbox(a)"
                    >
                      <img :src="a.url" :alt="a.filename" class="w-8 h-8 object-cover rounded shrink-0" />
                      <span class="flex-1 truncate text-sm">{{ a.filename }}</span>
                      <span class="text-xs text-(--ui-text-muted) shrink-0">{{ formatBytes(a.size_bytes) }}</span>
                    </button>
                    <a
                      v-else
                      :href="a.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center gap-2 px-2 py-1.5 rounded border border-(--ui-border) hover:border-(--ui-primary) transition-colors"
                    >
                      <UIcon name="i-lucide-paperclip" class="shrink-0" />
                      <span class="flex-1 truncate text-sm">{{ a.filename }}</span>
                      <span class="text-xs text-(--ui-text-muted) shrink-0">{{ formatBytes(a.size_bytes) }}</span>
                    </a>
                  </li>
                </ul>
              </div>
            </section>
          </div>

          <!-- Action bar -->
          <div class="shrink-0 border-t border-(--ui-border) bg-(--ui-bg-elevated) px-4 py-3 space-y-3">
            <!-- Inline accept controls -->
            <div class="flex flex-wrap items-center gap-2">
              <USelect
                v-model="acceptPriority"
                :items="PRIORITY_OPTIONS"
                placeholder="Priority"
                size="sm"
                class="w-32"
              />
              <USelectMenu
                v-model="acceptAssignee"
                :items="assigneeOptions"
                placeholder="Assignee"
                size="sm"
                class="w-40"
              />
              <span class="text-[11px] text-(--ui-text-muted)">optional — applied on Accept → {{ acceptColumnLabel }}</span>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <UButton
                color="success"
                icon="i-lucide-check"
                :loading="busy"
                @click="accept(selected)"
              >
                Accept <span class="opacity-60 ml-1 font-mono text-xs">e</span>
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-x"
                :disabled="busy"
                @click="openReject(selected)"
              >
                Reject <span class="opacity-60 ml-1 font-mono text-xs">#</span>
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-shield-alert"
                :disabled="busy"
                @click="openSpam(selected)"
              >
                Spam
              </UButton>

              <UDropdownMenu
                :items="SNOOZE_PRESETS.map(p => ({
                  label: p.label,
                  icon: 'i-lucide-alarm-clock',
                  onSelect: () => snooze(selected!, p.ms, p.label)
                }))"
              >
                <UButton color="neutral" variant="ghost" icon="i-lucide-alarm-clock" :disabled="busy">
                  Snooze
                </UButton>
              </UDropdownMenu>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Reject reason dialog -->
    <UModal v-model:open="rejectOpen" title="Reject feedback">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-(--ui-text-muted)">Pick a reason. The item moves to Archive.</p>
          <div class="grid grid-cols-2 gap-2">
            <UButton
              v-for="r in REJECT_REASONS"
              :key="r.key"
              :variant="rejectReason === r.key ? 'solid' : 'outline'"
              color="neutral"
              block
              @click="rejectReason = r.key"
            >
              {{ r.label }}
            </UButton>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="rejectOpen = false">Cancel</UButton>
          <UButton color="error" :disabled="!rejectReason" @click="confirmReject">Reject</UButton>
        </div>
      </template>
    </UModal>

    <!-- Spam reason dialog -->
    <UModal v-model:open="spamOpen" title="Mark as spam">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-(--ui-text-muted)">Pick a reason. The item moves to Archive.</p>
          <div class="grid grid-cols-2 gap-2">
            <UButton
              v-for="r in SPAM_REASONS"
              :key="r.key"
              :variant="spamReason === r.key ? 'solid' : 'outline'"
              color="neutral"
              block
              @click="spamReason = r.key"
            >
              {{ r.label }}
            </UButton>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="spamOpen = false">Cancel</UButton>
          <UButton color="error" :disabled="!spamReason" @click="confirmSpam">Mark spam</UButton>
        </div>
      </template>
    </UModal>

    <!-- Image lightbox (mirrors CardEditSidePanel) -->
    <UModal v-model:open="lightboxOpen" fullscreen :close="false">
      <template #content>
        <div class="relative w-screen h-screen bg-black flex items-center justify-center">
          <img
            :src="lightboxUrl"
            :alt="lightboxAlt"
            class="max-h-screen max-w-full w-auto h-auto object-contain"
          />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="solid"
            size="sm"
            class="absolute top-3 right-3"
            aria-label="Close"
            @click="lightboxOpen = false"
          />
          <a
            :href="lightboxUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/60 text-white text-xs hover:bg-black/80"
          >Open original ↗</a>
        </div>
      </template>
    </UModal>
  </div>
</template>
