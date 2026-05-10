<script setup lang="ts">
import type {
  KanbanCardModel,
  KanbanColumnModel,
  KanbanProjectModel,
  PostType
} from './types'

type Card = KanbanCardModel

interface MetaField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select'
  options?: string[]
  placeholder?: string
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  card: Card | null
  columns?: KanbanColumnModel[]
  projects?: KanbanProjectModel[]
}>(), {
  columns: () => [],
  projects: () => []
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [patch: Partial<Card> & { post_meta?: Record<string, any> }]
  delete: [cardId: string]
}>()

const toast = useToast()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

// -------- Draft state (deep clone to avoid mutating parent) --------
interface DraftState {
  id: string
  title: string
  post_type: PostType
  assignee: string
  start_date: string
  due_date: string
  description: string
  is_done: boolean
  testing_results: string
  post_meta: Record<string, any>
}

function makeDraft(c: Card | null): DraftState | null {
  if (!c) return null
  return {
    id: c.id,
    title: c.title ?? '',
    post_type: (c.post_type ?? 'task') as PostType,
    assignee: c.assignee ?? '',
    start_date: c.start_date ?? '',
    due_date: c.due_date ?? '',
    description: c.description ?? '',
    is_done: !!c.is_done,
    testing_results: c.testing_results ?? '',
    post_meta: JSON.parse(JSON.stringify(c.post_meta ?? {}))
  }
}

const draft = ref<DraftState | null>(null)
const saving = ref(false)
const showDeleteConfirm = ref(false)

watch(
  () => [props.card, props.modelValue] as const,
  ([c, isOpen]) => {
    if (isOpen && c) {
      draft.value = makeDraft(c)
      showDeleteConfirm.value = false
    }
  },
  { immediate: true }
)

// -------- Post-type dynamic field spec (matches Svelte getPostMetaFields) --------
const planField: MetaField = {
  name: 'plan',
  label: 'Plan',
  type: 'textarea',
  placeholder: 'Step-by-step plan for this card. Import via: ./kanban-agent-v2.sh import-plan "Card Title" plan.md'
}

const POST_META_FIELDS: Record<string, MetaField[]> = {
  task: [
    { name: 'estimated_hours', label: 'Estimated Hours', type: 'number', placeholder: '0' },
    { name: 'blocked_by', label: 'Blocked By', type: 'text', placeholder: 'Card IDs or blocker description' },
    { name: 'task_status', label: 'Task Status', type: 'select', options: ['todo', 'in_progress', 'blocked', 'completed'] },
    { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional task notes' },
    planField
  ],
  feature: [
    { name: 'priority_level', label: 'Priority Level', type: 'select', options: ['p0', 'p1', 'p2', 'p3'] },
    { name: 'estimated_effort', label: 'Estimated Effort', type: 'select', options: ['small', 'medium', 'large', 'xl'] },
    { name: 'dependencies', label: 'Dependencies', type: 'text', placeholder: 'Comma-separated card IDs or names' },
    { name: 'user_story', label: 'User Story', type: 'textarea', placeholder: 'As a [user], I want [goal] so that [benefit]' },
    { name: 'requirements', label: 'Requirements', type: 'textarea', placeholder: 'Detailed requirements' },
    { name: 'implementation_plan', label: 'Implementation Plan', type: 'textarea', placeholder: 'Step-by-step implementation plan' },
    planField
  ],
  bug: [
    { name: 'severity', label: 'Severity', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
    { name: 'priority_level', label: 'Priority Level', type: 'select', options: ['p0', 'p1', 'p2', 'p3'] },
    { name: 'reproducible', label: 'Reproducible', type: 'select', options: ['always', 'sometimes', 'rare'] },
    { name: 'affected_version', label: 'Affected Version', type: 'text', placeholder: 'e.g., v1.2.3' },
    { name: 'steps_to_reproduce', label: 'Steps to Reproduce', type: 'textarea', placeholder: '1. Step one\n2. Step two\n3. ...' },
    { name: 'bug_behavior', label: 'Bug Behavior', type: 'textarea', placeholder: 'Describe the bug behavior' },
    { name: 'bug_repair_plan', label: 'Bug Repair Plan', type: 'textarea', placeholder: 'Plan for fixing the bug' },
    planField
  ],
  artifact: [
    { name: 'artifact_type', label: 'Artifact Type', type: 'select', options: ['documentation', 'design', 'specification', 'diagram'] },
    { name: 'url', label: 'URL', type: 'text', placeholder: 'https://...' },
    { name: 'version', label: 'Version', type: 'text', placeholder: 'v1.0.0' },
    { name: 'documentation_link', label: 'Documentation Link', type: 'text', placeholder: 'Link to related docs' },
    { name: 'related_cards', label: 'Related Cards', type: 'text', placeholder: 'Comma-separated card IDs' },
    { name: 'artifact', label: 'Artifact Description', type: 'textarea', placeholder: 'Detailed description of the artifact' },
    planField
  ],
  feedback: [
    { name: 'feedback_sub_type', label: 'Feedback Type', type: 'select', options: ['bug_fix', 'new_feature', 'change_request'] },
    { name: 'reported_element', label: 'Reported Element', type: 'text', placeholder: 'Which element/component this refers to' },
    { name: 'problem_description', label: 'Problem Description', type: 'textarea', placeholder: 'Describe the problem' },
    { name: 'suggested_fix', label: 'Suggested Fix', type: 'textarea', placeholder: 'Suggested fix or improvement' },
    planField
  ]
}

const postTypeOptions = [
  { label: 'Task', value: 'task' },
  { label: 'Feature', value: 'feature' },
  { label: 'Bug', value: 'bug' },
  { label: 'Project Artifact', value: 'artifact' },
  { label: 'Feedback', value: 'feedback' }
]

// Reka's Select primitive (underlying Nuxt UI) reserves empty-string as the
// "no selection" state, so we can't use it as a real option value. Use
// USelect's `placeholder` prop to render the "-- Select --" affordance.
const priorityQualOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Highest', value: 'highest' }
]

const dynamicFields = computed<MetaField[]>(() => {
  if (!draft.value) return []
  return POST_META_FIELDS[draft.value.post_type] || []
})

// Feedback content fields (everything except `plan`, which renders in the Progress section)
const feedbackContentFields = computed<MetaField[]>(() =>
  (POST_META_FIELDS.feedback || []).filter(f => f.name !== 'plan')
)

// -------- Feedback attachments (admin view) --------
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

watch(
  () => [props.card?.id, props.card?.post_type, props.modelValue] as const,
  ([cardId, postType, isOpen]) => {
    if (isOpen && cardId && postType === 'feedback') {
      loadAttachments(cardId)
    } else {
      attachments.value = []
      attachmentsError.value = ''
    }
  },
  { immediate: true }
)

const screenshotAttachments = computed(() => attachments.value.filter(a => a.kind === 'screenshot'))
const fileAttachments = computed(() => attachments.value.filter(a => a.kind === 'attachment'))
function isImage(mime: string) { return typeof mime === 'string' && mime.startsWith('image/') }

// Lightbox modal for image attachments. Non-image attachments still open in a
// new tab via the regular anchor.
const lightboxOpen = ref(false)
const lightboxUrl = ref('')
const lightboxAlt = ref('')

function openLightbox(a: FeedbackAttachment) {
  lightboxUrl.value = a.url
  lightboxAlt.value = a.filename
  lightboxOpen.value = true
}

const postTypeHeading = computed(() => {
  if (!draft.value) return ''
  const pt = draft.value.post_type
  return pt.charAt(0).toUpperCase() + pt.slice(1) + ' Specific Fields'
})

function selectItems(options: string[]) {
  return options.map(o => ({ label: o, value: o }))
}

// -------- Meta helpers --------
function getMeta(key: string): any {
  if (!draft.value) return ''
  const v = draft.value.post_meta?.[key]
  return v === undefined || v === null ? '' : v
}

function getClientContext(key: string): any {
  const ctx = draft.value?.post_meta?.client_context
  if (!ctx || typeof ctx !== 'object') return ''
  const v = (ctx as Record<string, any>)[key]
  return v === undefined || v === null ? '' : v
}

const deviceSummary = computed(() => {
  if (!draft.value || draft.value.post_type !== 'feedback') return ''
  const parts = [
    getClientContext('device_type'),
    getClientContext('platform'),
    getClientContext('browser')
  ].filter(Boolean)
  if (!parts.length) return ''
  const label = parts[0] === 'mobile' ? 'Mobile' : parts[0] === 'desktop' ? 'Desktop' : parts[0]
  return [label, ...parts.slice(1)].join(' · ')
})

const submittedAtFormatted = computed(() => {
  const iso = getMeta('submitted_at')
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
})

function setMeta(key: string, value: any) {
  if (!draft.value) return
  const next = { ...(draft.value.post_meta || {}) }
  if (value === '' || value === null || value === undefined) {
    next[key] = null
  } else {
    next[key] = value
  }
  draft.value.post_meta = next
}

function setMetaNumber(key: string, value: any) {
  if (value === '' || value === null || value === undefined) {
    setMeta(key, null)
  } else {
    const n = Number(value)
    setMeta(key, Number.isNaN(n) ? null : n)
  }
}

// -------- Save / delete --------
async function handleSave() {
  if (!draft.value || !props.card) return
  saving.value = true
  try {
    const d = draft.value
    const patch: Partial<Card> & { post_meta?: Record<string, any> } = {
      title: d.title,
      post_type: d.post_type,
      description: d.description || null,
      assignee: d.assignee || null,
      start_date: d.start_date || null,
      due_date: d.due_date || null,
      is_done: d.is_done,
      testing_results: d.testing_results || null,
      // Deep-merge: preserve any existing post_meta keys we didn't edit
      post_meta: {
        ...(props.card.post_meta ?? {}),
        ...d.post_meta
      }
    }
    emit('save', patch)
  } finally {
    saving.value = false
  }
}

function handleDeleteClick() {
  showDeleteConfirm.value = true
}

function handleDeleteConfirm() {
  if (!draft.value) return
  emit('delete', draft.value.id)
  showDeleteConfirm.value = false
}

function handleDeleteCancel() {
  showDeleteConfirm.value = false
}

// -------- Agent bridge: format + clipboard --------
function determineActionFromColumn(columnName: string): string {
  const actions: Record<string, string> = {
    'BACKLOG': 'Plan',
    'PLANNING': 'Design & Architect',
    'BUILDING': 'Implement',
    'TESTING': 'Test & Validate',
    'DONE': 'Review & Document',
    'CHANGE REQUESTs': 'Analyze Change Request',
    'CHANGE REQUESTS': 'Analyze Change Request'
  }
  return actions[columnName] || 'Work On'
}

function getActionInstructions(action: string, cardType: string): string {
  const instructions: Record<string, Record<string, string>> = {
    'Plan': {
      'task': 'Help me create a detailed plan with steps to complete this task.',
      'feature': 'Help me design this feature with architecture, implementation approach, and acceptance criteria.',
      'bug': 'Help me analyze this bug, identify root cause, and create a fix plan.',
      'artifact': 'Help me define the structure and content for this project artifact.',
      'feedback': 'Help me triage this feedback item and decide on next steps.'
    },
    'Design & Architect': {
      'task': 'Help me break down this task into actionable steps.',
      'feature': 'Help me architect this feature with detailed design decisions.',
      'bug': 'Help me design the fix approach with implementation details.',
      'artifact': 'Help me outline the artifact structure and sections.',
      'feedback': 'Help me turn this feedback into a concrete design plan.'
    },
    'Implement': {
      'task': 'Help me implement this task step by step.',
      'feature': 'Help me build this feature according to the plan.',
      'bug': 'Help me implement the fix for this bug.',
      'artifact': 'Help me create the content for this artifact.',
      'feedback': 'Help me implement the change this feedback is asking for.'
    },
    'Test & Validate': {
      'task': 'Help me verify this task is complete and working.',
      'feature': 'Help me write tests and validate this feature works correctly.',
      'bug': 'Help me verify the bug is fixed and write regression tests.',
      'artifact': 'Help me review and validate this artifact is complete.',
      'feedback': 'Help me verify this feedback has been addressed.'
    },
    'Review & Document': {
      'task': 'Help me document what was done and any lessons learned.',
      'feature': 'Help me create documentation for this feature.',
      'bug': 'Help me document the bug fix and prevention strategy.',
      'artifact': 'Help me finalize and polish this artifact.',
      'feedback': 'Help me summarize what changed and notify the reporter.'
    }
  }
  return instructions[action]?.[cardType] || `Help me ${action.toLowerCase()} this ${cardType}.`
}

function currentColumn(): KanbanColumnModel | null {
  if (!draft.value || !props.card) return null
  return props.columns.find(c => c.id === props.card!.column_id) || null
}

function currentProject(): KanbanProjectModel | null {
  if (!draft.value || !props.card) return null
  return props.projects.find(p => p.id === props.card!.project_id) || null
}

function buildCardForContext(): Card | null {
  if (!draft.value || !props.card) return null
  const d = draft.value
  return {
    ...props.card,
    title: d.title,
    post_type: d.post_type,
    assignee: d.assignee || null,
    start_date: d.start_date || null,
    due_date: d.due_date || null,
    description: d.description || null,
    is_done: d.is_done,
    testing_results: d.testing_results || null,
    post_meta: { ...(props.card.post_meta ?? {}), ...d.post_meta }
  }
}

function formatCardContextForAgent(): string {
  const card = buildCardForContext()
  if (!card) return ''
  const col = currentColumn()
  const proj = currentProject()
  const columnName = col?.name || 'Unknown'
  const projectName = proj?.name || 'Unknown'
  const action = determineActionFromColumn(columnName)
  const qual = card.post_meta?.priority_qualitative
  const quant = card.post_meta?.priority_quantitative
  const metaFields = POST_META_FIELDS[card.post_type] || []

  const typeSpecificLines = metaFields
    .map(f => {
      const v = card.post_meta?.[f.name]
      if (v === undefined || v === null || v === '') return null
      return `- **${f.label}:** ${String(v)}`
    })
    .filter(Boolean)
    .join('\n')

  const lines: string[] = []
  lines.push(`# [${card.post_type}] ${card.title || 'Untitled'}`)
  lines.push('')
  lines.push(`**Project:** ${projectName}`)
  lines.push(`**Column:** ${columnName}`)
  lines.push(`**Status:** ${card.is_done ? 'Done ✓' : 'In progress'}`)
  if (qual || quant != null) {
    const qualStr = qual || 'none'
    const quantStr = quant != null && quant !== '' ? `${quant}/100` : 'n/a'
    lines.push(`**Priority:** ${qualStr} (${quantStr})`)
  }
  if (card.assignee) lines.push(`**Assignee:** ${card.assignee}`)
  if (card.due_date) lines.push(`**Due:** ${card.due_date}`)
  lines.push('')
  lines.push('## Description')
  lines.push(card.description || '_No description provided_')
  if (card.post_meta?.plan) {
    lines.push('')
    lines.push('## Plan')
    lines.push(String(card.post_meta.plan))
  }
  const impl = card.post_meta?.implementation_plan ?? card.post_meta?.bug_repair_plan ?? ''
  if (impl) {
    lines.push('')
    lines.push('## Implementation')
    lines.push(String(impl))
  }
  if (card.testing_results) {
    lines.push('')
    lines.push('## Testing')
    lines.push(card.testing_results)
  }
  if (typeSpecificLines) {
    lines.push('')
    lines.push('## Type-specific')
    lines.push(typeSpecificLines)
  }
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`**Action:** ${action} — ${getActionInstructions(action, card.post_type)}`)
  lines.push(`**Context Path:** \`${projectName} / ${columnName} / ${card.title}\``)
  lines.push('')
  lines.push('## Post Meta (All Fields)')
  lines.push('```json')
  lines.push(JSON.stringify(card.post_meta ?? {}, null, 2))
  lines.push('```')
  return lines.join('\n')
}

function formatClaudePrompt(): string {
  const card = buildCardForContext()
  if (!card) return ''
  const base = formatCardContextForAgent()
  const title = card.title || 'Untitled'
  const col = currentColumn()
  const action = determineActionFromColumn(col?.name || 'BACKLOG')

  return `${base}

---

## Kanban CLI Reference

Use \`./kanban\` to read and update this card.

### Commands for this card:

\`\`\`bash
# Read current state
./kanban get "${title}"

# Update description
./kanban update "${title}" "new description here"

# Update metadata fields
./kanban update-meta "${title}" plan "step-by-step plan content"
./kanban update-meta "${title}" implementation_plan "implementation details"

# Import a plan from file
./kanban import-plan "${title}" ./plan.md

# Move to next column when ready
./kanban move "${title}" "PLANNING"
./kanban move "${title}" "BUILDING"
./kanban move "${title}" "TESTING"
./kanban move "${title}" "DONE"

# Set priority
./kanban set-priority "${title}" high 85
\`\`\`

### Column workflow:
CHANGE REQUESTS -> BACKLOG -> PLANNING -> BUILDING -> TESTING -> DONE

### Your task:
**${action}** this ${card.post_type || 'task'} card. Start by reading it with \`./kanban get "${title}"\`, then fill in missing fields (plan, implementation, etc.) and move the card forward when appropriate.`
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to fallback
  }
  if (typeof document === 'undefined') return false
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-999999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

async function handleSendToAgent() {
  const text = formatCardContextForAgent()
  const ok = await copyToClipboard(text)
  if (ok) {
    toast.add({
      title: 'Copied to clipboard',
      description: 'Card context copied — paste into your agent.',
      icon: 'i-lucide-send',
      color: 'success'
    })
  } else {
    toast.add({
      title: 'Copy failed',
      description: 'Unable to access the clipboard.',
      color: 'error'
    })
  }
}

async function handleSendToClaude() {
  const text = formatClaudePrompt()
  const ok = await copyToClipboard(text)
  if (ok) {
    toast.add({
      title: 'Copied for Claude',
      description: 'Card context + CLI reference copied — paste into Claude.ai or Claude Code.',
      icon: 'i-lucide-sparkles',
      color: 'success'
    })
  } else {
    toast.add({
      title: 'Copy failed',
      description: 'Unable to access the clipboard.',
      color: 'error'
    })
  }
}

async function handleCopyPostMeta() {
  const card = buildCardForContext()
  if (!card) return
  const text = JSON.stringify(card.post_meta ?? {}, null, 2)
  const ok = await copyToClipboard(text)
  if (ok) {
    toast.add({
      title: 'Post meta copied',
      description: 'All post_meta fields copied as JSON.',
      icon: 'i-lucide-clipboard',
      color: 'success'
    })
  } else {
    toast.add({
      title: 'Copy failed',
      description: 'Unable to access the clipboard.',
      color: 'error'
    })
  }
}
</script>

<template>
  <USlideover v-model:open="open" side="right" :ui="{ content: 'max-w-lg' }">
    <template #content>
      <div v-if="draft" class="flex h-full flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-(--ui-border) px-4 py-3 gap-2">
          <h2 class="text-lg font-semibold shrink-0">Edit Card</h2>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-clipboard"
              title="Copy all post_meta fields as JSON"
              @click="handleCopyPostMeta"
            >
              Copy
            </UButton>
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              icon="i-lucide-send"
              title="Copy card context to clipboard for an AI agent"
              @click="handleSendToAgent"
            >
              Send to Agent
            </UButton>
            <UButton
              size="xs"
              color="warning"
              variant="soft"
              icon="i-lucide-sparkles"
              title="Copy card context + CLI reference for Claude"
              @click="handleSendToClaude"
            >
              Send to Claude
            </UButton>
            <UButton variant="ghost" icon="i-lucide-x" aria-label="Close" @click="open = false" />
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-4 py-4">
          <!-- Feedback: single-column 3-section layout -->
          <div v-if="draft.post_type === 'feedback'" class="space-y-6">
            <!-- Section 1: Submitter · From · Device · Date (compact info bar) -->
            <section class="space-y-1.5 text-sm">
              <div v-if="getMeta('submitter_name') || submittedAtFormatted || deviceSummary" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-(--ui-text-muted)">
                <span v-if="getMeta('submitter_name')" class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-user" class="shrink-0" />
                  <span class="text-(--ui-text)">{{ getMeta('submitter_name') }}</span>
                </span>
                <span v-if="submittedAtFormatted" class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-calendar" class="shrink-0" />
                  <span>{{ submittedAtFormatted }}</span>
                </span>
                <span v-if="deviceSummary" class="inline-flex items-center gap-1.5">
                  <UIcon
                    :name="getClientContext('is_mobile') ? 'i-lucide-smartphone' : 'i-lucide-monitor'"
                    class="shrink-0"
                  />
                  <span>{{ deviceSummary }}</span>
                </span>
              </div>
              <a
                v-if="getMeta('page_url')"
                :href="getMeta('page_url')"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 text-(--ui-primary) hover:underline break-all"
              >
                <UIcon name="i-lucide-external-link" class="shrink-0" />
                <span>{{ getMeta('page_url') }}</span>
              </a>
              <p v-if="!getMeta('submitter_name') && !getMeta('page_url') && !deviceSummary && !submittedAtFormatted" class="text-(--ui-text-muted) italic">
                No user or device info captured.
              </p>
            </section>

            <!-- Section 2: Feedback -->
            <section class="space-y-4 pt-4 border-t border-(--ui-border)">
              <h3 class="text-sm font-semibold text-(--ui-text-muted) uppercase tracking-wide">
                Feedback
              </h3>
              <UFormField label="Title">
                <UInput v-model="draft.title" placeholder="Card title" class="w-full" />
              </UFormField>
              <UFormField v-for="f in feedbackContentFields" :key="f.name" :label="f.label">
                <UTextarea
                  v-if="f.type === 'textarea'"
                  :rows="3"
                  :model-value="getMeta(f.name)"
                  :placeholder="f.placeholder || ''"
                  class="w-full"
                  @update:model-value="(v: any) => setMeta(f.name, v)"
                />
                <USelect
                  v-else-if="f.type === 'select'"
                  :model-value="getMeta(f.name) || undefined"
                  :items="selectItems(f.options || [])"
                  placeholder="-- Select --"
                  class="w-full"
                  @update:model-value="(v: any) => setMeta(f.name, v)"
                />
                <UInput
                  v-else-if="f.type === 'number'"
                  type="number"
                  :model-value="getMeta(f.name)"
                  :placeholder="f.placeholder || '0'"
                  class="w-full"
                  @update:model-value="(v: any) => setMetaNumber(f.name, v)"
                />
                <UInput
                  v-else
                  :model-value="getMeta(f.name)"
                  :placeholder="f.placeholder || ''"
                  class="w-full"
                  @update:model-value="(v: any) => setMeta(f.name, v)"
                />
              </UFormField>
            </section>

            <!-- Section 2b: Attachments -->
            <section class="space-y-3 pt-4 border-t border-(--ui-border)">
              <h3 class="text-sm font-semibold text-(--ui-text-muted) uppercase tracking-wide">
                Attachments
              </h3>
              <div v-if="attachmentsLoading" class="text-sm text-(--ui-text-muted) italic">
                Loading…
              </div>
              <div v-else-if="attachmentsError" class="text-sm text-(--ui-error)">
                {{ attachmentsError }}
              </div>
              <div v-else-if="!attachments.length" class="text-sm text-(--ui-text-muted) italic">
                No screenshots or files attached.
              </div>
              <div v-else class="space-y-3">
                <div v-if="screenshotAttachments.length" class="space-y-2">
                  <div class="text-xs font-medium text-(--ui-text-muted)">Screenshot</div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="a in screenshotAttachments"
                      :key="a.id"
                      type="button"
                      class="block w-32 rounded border border-(--ui-border) overflow-hidden hover:border-(--ui-primary) transition-colors text-left cursor-zoom-in"
                      :title="`${a.filename} · ${formatBytes(a.size_bytes)}`"
                      @click="openLightbox(a)"
                    >
                      <img :src="a.url" :alt="a.filename" class="w-full h-24 object-cover bg-(--ui-bg-muted)" />
                      <div class="px-2 py-1 text-xs truncate">{{ a.filename }}</div>
                    </button>
                  </div>
                </div>
                <div v-if="fileAttachments.length" class="space-y-2">
                  <div class="text-xs font-medium text-(--ui-text-muted)">Files</div>
                  <ul class="space-y-1">
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
              </div>
            </section>

            <!-- Section 3: Coordination -->
            <section class="space-y-4 pt-4 border-t border-(--ui-border)">
              <h3 class="text-sm font-semibold text-(--ui-text-muted) uppercase tracking-wide">
                Coordination
              </h3>
              <UFormField label="Card Type">
                <USelect v-model="draft.post_type" :items="postTypeOptions" class="w-full" />
              </UFormField>
              <UFormField label="Assignee">
                <UInput v-model="draft.assignee" placeholder="Assigned to" class="w-full" />
              </UFormField>
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Start Date">
                  <UInput v-model="draft.start_date" type="date" class="w-full" />
                </UFormField>
                <UFormField label="Due Date">
                  <UInput v-model="draft.due_date" type="date" class="w-full" />
                </UFormField>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Priority (Qualitative)">
                  <USelect
                    :model-value="getMeta('priority_qualitative') || undefined"
                    :items="priorityQualOptions"
                    placeholder="-- Select --"
                    class="w-full"
                    @update:model-value="(v: any) => setMeta('priority_qualitative', v)"
                  />
                </UFormField>
                <UFormField label="Priority (Quantitative)">
                  <UInput
                    type="number"
                    :model-value="getMeta('priority_quantitative')"
                    placeholder="1-100"
                    :min="1"
                    :max="100"
                    class="w-full"
                    @update:model-value="(v: any) => setMetaNumber('priority_quantitative', v)"
                  />
                </UFormField>
              </div>
              <UFormField label="Plan">
                <UTextarea
                  :rows="3"
                  :model-value="getMeta('plan')"
                  :placeholder="planField.placeholder || ''"
                  class="w-full"
                  @update:model-value="(v: any) => setMeta('plan', v)"
                />
              </UFormField>
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="draft.is_done" />
                <span class="text-sm font-medium">Mark as Done</span>
              </label>
              <UFormField label="Testing Results">
                <UTextarea
                  v-model="draft.testing_results"
                  :rows="3"
                  placeholder="Test results, feedback, notes..."
                  class="w-full"
                />
              </UFormField>
            </section>
          </div>

          <!-- Non-feedback: original flat layout -->
          <div v-else class="space-y-4">
            <UFormField label="Card Type">
              <USelect v-model="draft.post_type" :items="postTypeOptions" class="w-full" />
            </UFormField>

            <UFormField label="Title">
              <UInput v-model="draft.title" placeholder="Card title" class="w-full" />
            </UFormField>

            <UFormField label="Assignee">
              <UInput v-model="draft.assignee" placeholder="Assigned to" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Start Date">
                <UInput v-model="draft.start_date" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Due Date">
                <UInput v-model="draft.due_date" type="date" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Priority (Qualitative)">
                <USelect
                  :model-value="getMeta('priority_qualitative') || undefined"
                  :items="priorityQualOptions"
                  placeholder="-- Select --"
                  class="w-full"
                  @update:model-value="(v: any) => setMeta('priority_qualitative', v)"
                />
              </UFormField>
              <UFormField label="Priority (Quantitative)">
                <UInput
                  type="number"
                  :model-value="getMeta('priority_quantitative')"
                  placeholder="1-100"
                  :min="1"
                  :max="100"
                  class="w-full"
                  @update:model-value="(v: any) => setMetaNumber('priority_quantitative', v)"
                />
              </UFormField>
            </div>

            <UFormField label="Description">
              <UTextarea v-model="draft.description" :rows="4" placeholder="Card description" class="w-full" />
            </UFormField>

            <!-- Dynamic post-type-specific fields -->
            <div v-if="dynamicFields.length" class="space-y-3 pt-2 border-t border-(--ui-border)">
              <h3 class="text-sm font-semibold text-(--ui-text-muted) uppercase tracking-wide">
                {{ postTypeHeading }}
              </h3>

              <UFormField v-for="f in dynamicFields" :key="f.name" :label="f.label">
                <UTextarea
                  v-if="f.type === 'textarea'"
                  :rows="3"
                  :model-value="getMeta(f.name)"
                  :placeholder="f.placeholder || ''"
                  class="w-full"
                  @update:model-value="(v: any) => setMeta(f.name, v)"
                />
                <USelect
                  v-else-if="f.type === 'select'"
                  :model-value="getMeta(f.name) || undefined"
                  :items="selectItems(f.options || [])"
                  placeholder="-- Select --"
                  class="w-full"
                  @update:model-value="(v: any) => setMeta(f.name, v)"
                />
                <UInput
                  v-else-if="f.type === 'number'"
                  type="number"
                  :model-value="getMeta(f.name)"
                  :placeholder="f.placeholder || '0'"
                  class="w-full"
                  @update:model-value="(v: any) => setMetaNumber(f.name, v)"
                />
                <UInput
                  v-else
                  :model-value="getMeta(f.name)"
                  :placeholder="f.placeholder || ''"
                  class="w-full"
                  @update:model-value="(v: any) => setMeta(f.name, v)"
                />
              </UFormField>
            </div>

            <!-- Task done + testing results -->
            <div class="pt-2 border-t border-(--ui-border) space-y-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <UCheckbox v-model="draft.is_done" />
                <span class="text-sm font-medium">Mark as Done</span>
              </label>

              <UFormField label="Testing Results">
                <UTextarea
                  v-model="draft.testing_results"
                  :rows="3"
                  placeholder="Test results, feedback, notes..."
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="border-t border-(--ui-border) px-4 py-3">
          <div v-if="showDeleteConfirm" class="flex flex-col gap-2">
            <div class="text-sm font-medium text-(--ui-color-error-500)">
              Are you sure you want to delete this card?
            </div>
            <div class="flex gap-2">
              <UButton color="error" @click="handleDeleteConfirm">Yes, delete</UButton>
              <UButton variant="ghost" @click="handleDeleteCancel">Cancel</UButton>
            </div>
          </div>
          <div v-else class="flex items-center justify-between gap-2">
            <UButton color="error" variant="outline" icon="i-lucide-trash-2" @click="handleDeleteClick">
              Delete
            </UButton>
            <div class="flex items-center gap-2">
              <UButton variant="ghost" @click="open = false">Cancel</UButton>
              <UButton :loading="saving" icon="i-lucide-save" @click="handleSave">Save</UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </USlideover>

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
</template>
