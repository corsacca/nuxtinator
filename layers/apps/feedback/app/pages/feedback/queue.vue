<script setup lang="ts">
/**
 * Submission Detail Queue — a focused, one-at-a-time moderation view of the
 * FEEDBACK INBOX. Each submission is shown full size (screenshot, bug/idea
 * text, submitter, page/device context) with a forced decision that
 * auto-advances to the next item.
 *
 * Queue order is code-owned: a signal score (has-screenshot + non-anonymous +
 * bug-over-idea) computed here, oldest-first within the same score. Ordering is
 * never persisted. Skips PATCH an explicit `post_meta.triage_skipped_at` marker
 * so a skipped item drops to the back and out of the current session.
 */
import type {
  KanbanCardModel as Card,
  KanbanColumnModel as Column,
  KanbanProjectModel as Project
} from '../../components/kanban/types'

const toast = useToast()

definePageMeta({
  middleware: 'auth'
})

// Per-org reload trigger (multi-tenant); null in single mode.
const { slug: orgSlug } = useActiveOrg()

// ---- Column constants (code-owned, match the global board columns) ----
const INBOX_COLUMN = 'FEEDBACK INBOX'
const ARCHIVE_COLUMN = 'ARCHIVE'
const DEFAULT_ACCEPT_COLUMN = 'BACKLOG'

// Reka's Select primitive reserves empty-string as the "no selection" state, so
// the options carry no empty value — the USelect renders a placeholder instead
// and the form refs hold '' (mapped to undefined at the prop boundary).
const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Highest', value: 'highest' }
]

// ---- Loaded board metadata ----
const projects = ref<Project[]>([])
const columns = ref<Column[]>([])
const assignableUsers = ref<{ id: string, display_name: string | null }[]>([])

const loading = ref(true)
const error = ref('')

// ---- The session queue ----
// `queue` holds the inbox cards in code-owned order. `cursor` points at the
// current item. Items are removed from `queue` as they're decided/skipped, so
// `cursor` always indexes the next pending item once the current one resolves.
const queue = ref<Card[]>([])
const cursor = ref(0)
// Total inbox items seen at load, for the progress meter denominator.
const totalAtStart = ref(0)
const decidedCount = ref(0)

// Destination columns offered for Accept — everything past the inbox, excluding
// ARCHIVE (that's its own decision). Defaults to BACKLOG.
const acceptColumns = computed(() =>
  columns.value.filter(c => c.name !== INBOX_COLUMN && c.name !== ARCHIVE_COLUMN)
)

const current = computed<Card | null>(() => queue.value[cursor.value] ?? null)
const remaining = computed(() => queue.value.length - cursor.value)

const projectName = computed(() => {
  const c = current.value
  if (!c) return ''
  return projects.value.find(p => p.id === c.project_id)?.name ?? ''
})

// ---- Per-item decision form (reset whenever the current item changes) ----
const acceptColumnId = ref('')
const acceptPriority = ref('')
// May become null when the assignee picker is cleared; coalesced on submit.
const acceptAssignee = ref<string | null>('')

// Assignee is stored as the display-name string (the board avatar keys off it).
// No empty-value option for the same Reka reason as priority — clearing is done
// via USelectMenu's clear affordance.
const assigneeOptions = computed<string[]>(() =>
  assignableUsers.value
    .map(u => u.display_name)
    .filter((n): n is string => !!n)
)

watch(current, (c) => {
  // Default Accept destination to BACKLOG (or the first available column).
  const backlog = acceptColumns.value.find(col => col.name === DEFAULT_ACCEPT_COLUMN)
  acceptColumnId.value = backlog?.id ?? acceptColumns.value[0]?.id ?? ''
  acceptPriority.value = ''
  acceptAssignee.value = (c?.assignee as string | null) || ''
  loadAttachments(c)
})

// ---- Code-owned signal score + queue ordering ----
// Higher score = surfaced first. Screenshots and named submitters carry the
// most signal; bugs edge out ideas. Pure code — never persisted.
function signalScore(c: Card): number {
  const m = c.post_meta || {}
  let score = 0
  if (m.has_screenshot) score += 3
  if (m.submitter_anonymous === false) score += 2
  if (m.feedback_sub_type === 'bug') score += 1
  return score
}

function orderQueue(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    // Already-skipped items sink to the back regardless of score.
    const aSkip = a.post_meta?.triage_skipped_at ? 1 : 0
    const bSkip = b.post_meta?.triage_skipped_at ? 1 : 0
    if (aSkip !== bSkip) return aSkip - bSkip
    const ds = signalScore(b) - signalScore(a)
    if (ds !== 0) return ds
    // Oldest-first within the same score — clear the backlog FIFO.
    return Date.parse(a.created_at) - Date.parse(b.created_at)
  })
}

// ---- Load ----
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

    const inbox = columnsRes.find(c => c.name === INBOX_COLUMN)
    if (!inbox) {
      error.value = `Missing "${INBOX_COLUMN}" column.`
      queue.value = []
      return
    }

    // Pull each project's inbox feedback cards, then merge into one ordered
    // queue. Per-project fetch mirrors the board — the cards endpoint scopes by
    // project_id.
    const cardResults = await Promise.all(
      projectsRes.map(p =>
        $fetch<Card[]>('/api/feedback/cards', {
          query: { project_id: p.id, column_id: inbox.id, post_type: 'feedback' }
        }).catch(() => [])
      )
    )
    const inboxCards = cardResults.flat()
    queue.value = orderQueue(inboxCards)
    cursor.value = 0
    decidedCount.value = 0
    totalAtStart.value = queue.value.length
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load queue'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
watch(orgSlug, loadAll)

// ---- Attachments (signed URLs minted on read by the admin endpoint) ----
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

async function loadAttachments(c: Card | null) {
  attachments.value = []
  if (!c || c.post_type !== 'feedback') return
  attachmentsLoading.value = true
  try {
    const rows = await $fetch<FeedbackAttachment[]>(
      `/api/admin/feedback/${encodeURIComponent(c.id)}/attachments`
    )
    attachments.value = Array.isArray(rows) ? rows : []
  } catch {
    attachments.value = []
  } finally {
    attachmentsLoading.value = false
  }
}

const screenshotAttachments = computed(() => attachments.value.filter(a => a.kind === 'screenshot'))
const fileAttachments = computed(() => attachments.value.filter(a => a.kind === 'attachment'))
function isImage(mime: string) { return typeof mime === 'string' && mime.startsWith('image/') }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// ---- Lightbox (mirrors CardEditSidePanel) ----
const lightboxOpen = ref(false)
const lightboxUrl = ref('')
const lightboxAlt = ref('')
function openLightbox(a: FeedbackAttachment) {
  lightboxUrl.value = a.url
  lightboxAlt.value = a.filename
  lightboxOpen.value = true
}

// ---- Meta accessors ----
function meta(key: string): any {
  const v = current.value?.post_meta?.[key]
  return v === undefined || v === null ? '' : v
}
function clientCtx(key: string): any {
  const ctx = current.value?.post_meta?.client_context
  if (!ctx || typeof ctx !== 'object') return ''
  const v = (ctx as Record<string, any>)[key]
  return v === undefined || v === null ? '' : v
}

const isIdea = computed(() => meta('feedback_sub_type') === 'idea')
const problemDescription = computed(() => String(meta('problem_description') || ''))
const suggestedFix = computed(() => String(meta('suggested_fix') || ''))

const submitterLabel = computed(() => {
  const name = meta('submitter_name')
  const email = meta('submitter_email')
  if (name && email) return `${name} · ${email}`
  return name || email || (meta('submitter_anonymous') ? 'Anonymous' : 'Unknown')
})

const deviceSummary = computed(() => {
  const parts = [clientCtx('device_type'), clientCtx('platform'), clientCtx('browser')].filter(Boolean)
  if (!parts.length) return ''
  const head = parts[0] === 'mobile' ? 'Mobile' : parts[0] === 'desktop' ? 'Desktop' : parts[0]
  return [head, ...parts.slice(1)].join(' · ')
})

const submittedAtFormatted = computed(() => {
  const iso = meta('submitted_at') || current.value?.created_at
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
})

const currentScore = computed(() => (current.value ? signalScore(current.value) : 0))

// ---- Decisions ----
const committing = ref(false)

// Advance past the current item once a decision resolves. The item is spliced
// out so `cursor` keeps pointing at the next pending submission.
function advance(decided: boolean) {
  const c = current.value
  if (!c) return
  queue.value.splice(cursor.value, 1)
  if (decided) decidedCount.value += 1
  if (cursor.value > queue.value.length - 1) cursor.value = Math.max(0, queue.value.length - 1)
}

async function moveCard(card: Card, columnName: string): Promise<Card> {
  const col = columns.value.find(c => c.name === columnName)
  if (!col) throw new Error(`Missing "${columnName}" column`)
  return await $fetch<Card>(`/api/feedback/cards/${card.id}/move`, {
    method: 'PATCH',
    body: { column_id: col.id, swimlane_id: card.swimlane_id }
  })
}

async function patchCard(cardId: string, body: Record<string, any>): Promise<Card> {
  return await $fetch<Card>(`/api/feedback/cards/${cardId}`, { method: 'PATCH', body })
}

async function onAccept() {
  const c = current.value
  if (!c || committing.value) return
  const col = columns.value.find(col => col.id === acceptColumnId.value)
  if (!col) {
    toast.add({ title: 'Choose a destination column', color: 'error' })
    return
  }
  committing.value = true
  try {
    // Priority + assignee ride in post_meta (priority) and the card's assignee
    // column, matching how the edit panel persists them.
    await patchCard(c.id, {
      assignee: acceptAssignee.value || null,
      post_meta: {
        ...(c.post_meta ?? {}),
        priority_qualitative: acceptPriority.value || null
      }
    })
    await moveCard(c, col.name)
    toast.add({ title: 'Accepted', description: `Moved to ${col.name}`, icon: 'i-lucide-check', color: 'success' })
    advance(true)
  } catch (e: any) {
    toast.add({ title: 'Accept failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    committing.value = false
  }
}

async function onArchive() {
  const c = current.value
  if (!c || committing.value) return
  committing.value = true
  try {
    await moveCard(c, ARCHIVE_COLUMN)
    toast.add({ title: 'Archived', icon: 'i-lucide-archive', color: 'neutral' })
    advance(true)
  } catch (e: any) {
    toast.add({ title: 'Archive failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    committing.value = false
  }
}

async function onSpam() {
  const c = current.value
  if (!c || committing.value) return
  committing.value = true
  try {
    // Mark the explicit spam override, then archive so it leaves the inbox.
    await patchCard(c.id, {
      post_meta: { ...(c.post_meta ?? {}), triage_spam: true }
    })
    await moveCard(c, ARCHIVE_COLUMN)
    toast.add({ title: 'Marked spam', icon: 'i-lucide-ban', color: 'warning' })
    advance(true)
  } catch (e: any) {
    toast.add({ title: 'Spam failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    committing.value = false
  }
}

async function onSkip() {
  const c = current.value
  if (!c || committing.value) return
  committing.value = true
  // Persist an explicit skip marker so the item sinks to the back of future
  // sessions; it leaves this session immediately via advance() below.
  try {
    await patchCard(c.id, {
      post_meta: { ...(c.post_meta ?? {}), triage_skipped_at: new Date().toISOString() }
    })
  } catch {
    // Non-fatal — the item still leaves this session below.
  } finally {
    advance(false)
    committing.value = false
  }
}

// ---- Keyboard shortcuts: A accept, E archive, S spam, K skip ----
function onKey(e: KeyboardEvent) {
  if (!current.value || committing.value) return
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  const k = e.key.toLowerCase()
  if (k === 'a') { e.preventDefault(); onAccept() }
  else if (k === 'e') { e.preventDefault(); onArchive() }
  else if (k === 's') { e.preventDefault(); onSpam() }
  else if (k === 'k') { e.preventDefault(); onSkip() }
}

onMounted(() => {
  if (import.meta.client) window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  if (import.meta.client) window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="h-full flex flex-col min-h-0 bg-(--ui-bg-muted)">
    <!-- Header / progress -->
    <div class="shrink-0 bg-(--ui-bg-elevated) border-b border-(--ui-border) px-4 py-2 flex items-center gap-3">
      <UIcon name="i-lucide-list-checks" class="shrink-0" />
      <h1 class="font-semibold text-sm sm:text-base shrink-0">Submission queue</h1>

      <div class="flex-1 min-w-0 px-2">
        <UProgress
          v-if="totalAtStart > 0"
          :model-value="decidedCount"
          :max="totalAtStart"
          size="sm"
        />
      </div>

      <span class="text-xs sm:text-sm text-(--ui-text-muted) font-mono shrink-0 whitespace-nowrap">
        {{ remaining }} of {{ totalAtStart }} remaining
      </span>

      <UButton
        variant="ghost"
        size="sm"
        icon="i-lucide-layout-dashboard"
        to="/feedback"
        aria-label="Back to board"
      >
        Board
      </UButton>
      <UButton
        variant="ghost"
        size="sm"
        icon="i-lucide-refresh-ccw"
        aria-label="Reload"
        @click="loadAll"
      />
    </div>

    <UAlert v-if="error" color="error" :title="error" class="m-4 shrink-0" />

    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center text-(--ui-text-muted)">
      Loading queue…
    </div>

    <!-- Empty / done -->
    <div v-else-if="!current" class="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <UIcon name="i-lucide-party-popper" class="size-10 text-(--ui-primary)" />
      <p class="text-lg font-medium">Inbox clear</p>
      <p class="text-(--ui-text-muted) max-w-sm">
        No more submissions to review.
        <span v-if="decidedCount">You triaged {{ decidedCount }} this session.</span>
      </p>
      <div class="flex gap-2 pt-2">
        <UButton variant="soft" icon="i-lucide-refresh-ccw" @click="loadAll">Check again</UButton>
        <UButton variant="ghost" icon="i-lucide-layout-dashboard" to="/feedback">Open board</UButton>
      </div>
    </div>

    <!-- One submission, full-bleed -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto">
      <div class="mx-auto max-w-5xl px-4 py-6 space-y-5">
        <!-- Title row -->
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <UBadge
                :color="isIdea ? 'info' : 'error'"
                variant="subtle"
                :icon="isIdea ? 'i-lucide-lightbulb' : 'i-lucide-bug'"
              >
                {{ isIdea ? 'Idea' : 'Bug' }}
              </UBadge>
              <UBadge v-if="projectName" color="neutral" variant="soft">{{ projectName }}</UBadge>
              <UBadge color="neutral" variant="outline" :title="`Signal score ${currentScore}`">
                <UIcon name="i-lucide-signal" class="size-3" />
                {{ currentScore }}
              </UBadge>
            </div>
            <h2 class="text-xl font-semibold leading-snug break-words">
              {{ current.title || (isIdea ? 'Untitled idea' : 'Untitled bug') }}
            </h2>
          </div>
        </div>

        <!-- Context strip -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-(--ui-text-muted) bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg px-3 py-2">
          <span class="inline-flex items-center gap-1.5">
            <UIcon name="i-lucide-user" class="shrink-0" />
            <span class="text-(--ui-text)">{{ submitterLabel }}</span>
          </span>
          <span v-if="submittedAtFormatted" class="inline-flex items-center gap-1.5">
            <UIcon name="i-lucide-calendar" class="shrink-0" />
            <span>{{ submittedAtFormatted }}</span>
          </span>
          <span v-if="deviceSummary" class="inline-flex items-center gap-1.5">
            <UIcon
              :name="clientCtx('is_mobile') ? 'i-lucide-smartphone' : 'i-lucide-monitor'"
              class="shrink-0"
            />
            <span>{{ deviceSummary }}</span>
          </span>
          <a
            v-if="meta('page_url')"
            :href="meta('page_url')"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-(--ui-primary) hover:underline break-all"
          >
            <UIcon name="i-lucide-external-link" class="shrink-0" />
            <span>{{ meta('page_path') || meta('page_url') }}</span>
          </a>
        </div>

        <!-- Screenshot (large) -->
        <div v-if="attachmentsLoading" class="text-sm text-(--ui-text-muted) italic">
          Loading attachments…
        </div>
        <div v-else-if="screenshotAttachments.length" class="space-y-2">
          <button
            v-for="a in screenshotAttachments"
            :key="a.id"
            type="button"
            class="block w-full rounded-lg border border-(--ui-border) overflow-hidden bg-(--ui-bg-elevated) hover:border-(--ui-primary) transition-colors cursor-zoom-in"
            :title="`${a.filename} · ${formatBytes(a.size_bytes)} — click to enlarge`"
            @click="openLightbox(a)"
          >
            <img :src="a.url" :alt="a.filename" class="w-full max-h-[28rem] object-contain bg-black/5" />
          </button>
        </div>

        <!-- Bug / idea text -->
        <div class="grid gap-4 sm:grid-cols-2">
          <section class="space-y-1.5">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
              {{ isIdea ? 'Idea' : 'Problem' }}
            </h3>
            <p class="whitespace-pre-wrap break-words text-(--ui-text)">
              {{ (isIdea ? suggestedFix : problemDescription) || '—' }}
            </p>
          </section>
          <section class="space-y-1.5">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
              {{ isIdea ? 'Problem it solves' : 'Suggested fix' }}
            </h3>
            <p class="whitespace-pre-wrap break-words text-(--ui-text)">
              {{ (isIdea ? problemDescription : suggestedFix) || '—' }}
            </p>
          </section>
        </div>

        <!-- Other file attachments -->
        <div v-if="fileAttachments.length" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">Files</h3>
          <ul class="space-y-1">
            <li v-for="a in fileAttachments" :key="a.id">
              <button
                v-if="isImage(a.mime_type)"
                type="button"
                class="flex w-full items-center gap-2 px-2 py-1.5 rounded border border-(--ui-border) bg-(--ui-bg-elevated) hover:border-(--ui-primary) transition-colors text-left cursor-zoom-in"
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
                class="flex items-center gap-2 px-2 py-1.5 rounded border border-(--ui-border) bg-(--ui-bg-elevated) hover:border-(--ui-primary) transition-colors"
              >
                <UIcon name="i-lucide-paperclip" class="shrink-0" />
                <span class="flex-1 truncate text-sm">{{ a.filename }}</span>
                <span class="text-xs text-(--ui-text-muted) shrink-0">{{ formatBytes(a.size_bytes) }}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Decision row (big targets) -->
    <div
      v-if="!loading && current"
      class="shrink-0 border-t border-(--ui-border) bg-(--ui-bg-elevated) px-4 py-3"
    >
      <div class="mx-auto max-w-5xl flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <!-- Accept config -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
          <UFormField label="Destination" size="sm">
            <USelect
              v-model="acceptColumnId"
              :items="acceptColumns.map(c => ({ label: c.name, value: c.id }))"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Priority" size="sm">
            <USelect
              :model-value="acceptPriority || undefined"
              :items="priorityOptions"
              placeholder="No priority"
              class="w-full"
              @update:model-value="(v: any) => acceptPriority = v || ''"
            />
          </UFormField>
          <UFormField label="Assignee" size="sm">
            <USelectMenu
              v-model="acceptAssignee"
              :items="assigneeOptions"
              placeholder="Unassigned"
              :clear="true"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Decision buttons -->
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="success"
            size="lg"
            icon="i-lucide-check"
            :loading="committing"
            @click="onAccept"
          >
            Accept
            <UKbd value="A" />
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            size="lg"
            icon="i-lucide-archive"
            :disabled="committing"
            @click="onArchive"
          >
            Archive
            <UKbd value="E" />
          </UButton>
          <UButton
            color="warning"
            variant="soft"
            size="lg"
            icon="i-lucide-ban"
            :disabled="committing"
            @click="onSpam"
          >
            Spam
            <UKbd value="S" />
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="lg"
            icon="i-lucide-skip-forward"
            :disabled="committing"
            @click="onSkip"
          >
            Skip
            <UKbd value="K" />
          </UButton>
        </div>
      </div>
    </div>

    <!-- Lightbox -->
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
