<script setup lang="ts">
import ProjectsBoard from '../../components/kanban/ProjectsBoard.vue'
import CardEditSidePanel from '../../components/kanban/CardEditSidePanel.vue'
import KanbanContextMenu from '../../components/kanban/KanbanContextMenu.vue'
import type {
  KanbanCardModel as Card,
  KanbanColumnModel as Column,
  KanbanSwimlaneModel as Swimlane,
  KanbanProjectModel as Project
} from '../../components/kanban/types'

const toast = useToast()

definePageMeta({
  middleware: 'auth'
})

// Scope key for collapse / row-height localStorage. In multi-mode this is
// the active org slug, so per-org UI state survives org switches without
// crosstalk. In single-mode it falls back to a constant.
const { slug: orgSlug } = useActiveOrg()
const scope = computed(() => orgSlug.value ?? 'default')

// ---------- Ctrl+scroll zoom ----------
const zoomLevel = ref(100)

function handleWheel(event: WheelEvent) {
  if (!event.ctrlKey) return
  event.preventDefault()
  const delta = -Math.sign(event.deltaY)
  zoomLevel.value = Math.max(50, Math.min(200, zoomLevel.value + delta * 5))
}

onMounted(() => {
  if (import.meta.client) {
    window.addEventListener('wheel', handleWheel, { passive: false })
  }
})

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener('wheel', handleWheel)
  }
})

const projects = ref<Project[]>([])
const columns = ref<Column[]>([])
const swimlanes = ref<Swimlane[]>([])
const cards = ref<Card[]>([])
const assignableUsers = ref<{ id: string, display_name: string | null }[]>([])
const loading = ref(true)
const error = ref('')

const cardPanelOpen = ref(false)
const activeCard = ref<Card | null>(null)

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

    const laneResults = await Promise.all(
      projects.value.map(p => $fetch<Swimlane[]>('/api/feedback/swimlanes', { query: { project_id: p.id } }))
    )
    swimlanes.value = laneResults.flat()

    const cardResults = await Promise.all(
      projects.value.map(p => $fetch<Card[]>('/api/feedback/cards', { query: { project_id: p.id } }))
    )
    cards.value = cardResults.flat()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load board'
  } finally {
    loading.value = false
  }
}

const pollPaused = computed(
  () => cardPanelOpen.value || projectModalOpen.value || swimlaneModalOpen.value || cardModalOpen.value
)

async function refreshCards() {
  if (loading.value) return
  try {
    const cardResults = await Promise.all(
      projects.value.map(p => $fetch<Card[]>('/api/feedback/cards', { query: { project_id: p.id } }))
    )
    cards.value = cardResults.flat()
  } catch (err) {
    console.warn('Auto-poll failed:', err)
  }
}

const { start: startPoll, stop: stopPoll } = useBoardPoll(refreshCards, pollPaused, 5000)

onMounted(() => {
  loadAll().then(() => startPoll())
})

onUnmounted(() => {
  stopPoll()
})

// Reload when active org changes (multi-tenant).
watch(orgSlug, () => {
  stopPoll()
  loadAll().then(() => startPoll())
})

// ---------- Project modal ----------
const projectModalOpen = ref(false)
const projectForm = ref({
  id: '' as string,
  name: '',
  description: '',
  allowedOrigins: '',
  mode: 'create' as 'create' | 'edit'
})
const projectBusy = ref(false)

// The allowed-origins textarea accepts one origin per line (commas/spaces also
// split). The server re-validates and normalizes, so loose parsing is fine.
function parseOriginsInput(value: string): string[] {
  return value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
}

function openCreateProject() {
  projectForm.value = { id: '', name: '', description: '', allowedOrigins: '', mode: 'create' }
  projectModalOpen.value = true
}
function openRenameProject(p: Project) {
  projectForm.value = {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    allowedOrigins: (p.allowed_origins ?? []).join('\n'),
    mode: 'edit'
  }
  projectModalOpen.value = true
}
async function submitProject() {
  if (!projectForm.value.name.trim()) return
  projectBusy.value = true
  try {
    if (projectForm.value.mode === 'create') {
      const p = await $fetch<Project>('/api/feedback/projects', {
        method: 'POST',
        body: {
          name: projectForm.value.name.trim(),
          description: projectForm.value.description
        }
      })
      projects.value.push(p)
      const lanes = await $fetch<Swimlane[]>('/api/feedback/swimlanes', { query: { project_id: p.id } })
      swimlanes.value.push(...lanes)
    } else {
      const updated = await $fetch<Project>(`/api/feedback/projects/${projectForm.value.id}`, {
        method: 'PATCH',
        body: {
          name: projectForm.value.name.trim(),
          description: projectForm.value.description,
          allowed_origins: parseOriginsInput(projectForm.value.allowedOrigins)
        }
      })
      const i = projects.value.findIndex(x => x.id === updated.id)
      if (i >= 0) projects.value.splice(i, 1, updated)
    }
    projectModalOpen.value = false
  } catch (e: any) {
    toast.add({ title: 'Project save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    projectBusy.value = false
  }
}
async function deleteProject(p: Project) {
  if (!import.meta.client || !confirm(`Delete project "${p.name}" and all its cards + swimlanes?`)) return
  try {
    await $fetch(`/api/feedback/projects/${p.id}`, { method: 'DELETE' })
    projects.value = projects.value.filter(x => x.id !== p.id)
    swimlanes.value = swimlanes.value.filter(s => s.project_id !== p.id)
    cards.value = cards.value.filter(c => c.project_id !== p.id)
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

// ---------- Swimlane modal ----------
const swimlaneModalOpen = ref(false)
const swimlaneForm = ref({ projectId: '', name: '' })
const swimlaneBusy = ref(false)
function openAddSwimlane(projectId: string) {
  swimlaneForm.value = { projectId, name: '' }
  swimlaneModalOpen.value = true
}
async function submitSwimlane() {
  if (!swimlaneForm.value.name.trim()) return
  swimlaneBusy.value = true
  try {
    const lane = await $fetch<Swimlane>('/api/feedback/swimlanes', {
      method: 'POST',
      body: { project_id: swimlaneForm.value.projectId, name: swimlaneForm.value.name.trim() }
    })
    swimlanes.value.push(lane)
    swimlaneModalOpen.value = false
  } catch (e: any) {
    toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    swimlaneBusy.value = false
  }
}

// ---------- Card modal ----------
const cardModalOpen = ref(false)
const cardForm = ref({
  title: '',
  columnId: '',
  swimlaneId: '',
  projectId: ''
})
const cardBusy = ref(false)
function openAddCard(payload: { columnId: string; swimlaneId: string; projectId: string }) {
  cardForm.value = { title: '', ...payload }
  cardModalOpen.value = true
}
async function submitCard() {
  if (!cardForm.value.title.trim()) return
  cardBusy.value = true
  try {
    const created = await $fetch<Card>('/api/feedback/cards', {
      method: 'POST',
      body: {
        project_id: cardForm.value.projectId,
        column_id: cardForm.value.columnId,
        swimlane_id: cardForm.value.swimlaneId,
        title: cardForm.value.title.trim(),
        // Feedback-only board; new cards default to a bug, editable in the panel.
        post_meta: { feedback_sub_type: 'bug' }
      }
    })
    cards.value.push(created)
    cardModalOpen.value = false
  } catch (e: any) {
    toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    cardBusy.value = false
  }
}

// ---------- Card panel (edit/move) ----------
function openCard(card: Card) {
  activeCard.value = card
  cardPanelOpen.value = true
}
async function onCardDrop(payload: {
  card: Card
  toColumnId: string
  toSwimlaneId: string
  toProjectId: string
}) {
  const idx = cards.value.findIndex(c => c.id === payload.card.id)
  if (idx < 0) return
  const prev = cards.value[idx]!
  const isCrossProject = payload.toProjectId !== payload.card.project_id
  const optimistic: Card = {
    ...prev,
    column_id: payload.toColumnId,
    swimlane_id: payload.toSwimlaneId,
    ...(isCrossProject ? { project_id: payload.toProjectId } : {})
  }
  cards.value.splice(idx, 1, optimistic)
  try {
    const body: Record<string, string> = {
      column_id: payload.toColumnId,
      swimlane_id: payload.toSwimlaneId,
      project_id: payload.toProjectId
    }
    const updated = await $fetch<Card>(`/api/feedback/cards/${payload.card.id}/move`, {
      method: 'PATCH',
      body
    })
    if (isCrossProject) {
      cards.value.splice(cards.value.findIndex(c => c.id === optimistic.id), 1)
      cards.value.push(updated)
    } else {
      const i = cards.value.findIndex(c => c.id === updated.id)
      if (i >= 0) cards.value.splice(i, 1, updated)
    }
  } catch (e: any) {
    cards.value.splice(idx, 1, prev)
    toast.add({ title: 'Move failed', description: e?.data?.statusMessage, color: 'error' })
    await loadAll()
  }
}
async function onSaveCard(patch: Partial<Card>) {
  if (!activeCard.value) return
  try {
    const updated = await $fetch<Card>(`/api/feedback/cards/${activeCard.value.id}`, {
      method: 'PATCH',
      body: patch
    })
    const i = cards.value.findIndex(c => c.id === updated.id)
    if (i >= 0) cards.value.splice(i, 1, updated)
    cardPanelOpen.value = false
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  }
}
async function onDeleteCard(cardId: string) {
  try {
    await $fetch(`/api/feedback/cards/${cardId}`, { method: 'DELETE' })
    cards.value = cards.value.filter(c => c.id !== cardId)
    cardPanelOpen.value = false
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

// --- Context menu ---
const ctxMenu = ref<{
  open: boolean
  x: number
  y: number
  items: Array<{ label: string; icon?: string; danger?: boolean; action: string }>
  target:
    | { kind: 'project'; project: Project }
    | { kind: 'column'; column: Column }
    | { kind: 'card'; card: Card }
    | null
}>({ open: false, x: 0, y: 0, items: [], target: null })

function openCardCtx(e: { card: Card; x: number; y: number }) {
  ctxMenu.value = {
    open: true,
    x: e.x,
    y: e.y,
    target: { kind: 'card', card: e.card },
    items: [
      { label: 'Edit Card', icon: 'i-lucide-pencil', action: 'edit' },
      { label: 'Delete Card', icon: 'i-lucide-trash-2', danger: true, action: 'delete' }
    ]
  }
}

function openProjectCtx(e: { x: number; y: number; project: Project }) {
  ctxMenu.value = {
    open: true,
    x: e.x,
    y: e.y,
    target: { kind: 'project', project: e.project },
    items: [
      { label: 'Rename', icon: 'i-lucide-pencil', action: 'rename' },
      { label: 'Add swimlane', icon: 'i-lucide-plus', action: 'add-swimlane' },
      { label: 'Delete', icon: 'i-lucide-trash-2', danger: true, action: 'delete' }
    ]
  }
}

function openColumnCtx(e: { x: number; y: number; column: Column }) {
  const isProtected = ['FEEDBACK INBOX', 'DOING', 'DONE', 'ARCHIVE'].includes(e.column.name)
  ctxMenu.value = {
    open: true,
    x: e.x,
    y: e.y,
    target: { kind: 'column', column: e.column },
    items: [
      { label: 'Rename', icon: 'i-lucide-pencil', action: 'rename' },
      ...(isProtected ? [] : [{ label: 'Delete', icon: 'i-lucide-trash-2', danger: true, action: 'delete' }])
    ]
  }
}

function onCtxSelect(action: string) {
  const t = ctxMenu.value.target
  ctxMenu.value.open = false
  if (!t) return
  if (t.kind === 'card') {
    if (action === 'edit') openCard(t.card)
    else if (action === 'delete') onDeleteCard(t.card.id)
    return
  }
  if (t.kind === 'project') {
    if (action === 'rename') openRenameProject(t.project)
    else if (action === 'add-swimlane') openAddSwimlane(t.project.id)
    else if (action === 'delete') deleteProject(t.project)
  } else if (t.kind === 'column') {
    if (action === 'rename') {
      if (!import.meta.client) return
      const name = prompt('Column name', t.column.name)
      if (name) {
        $fetch(`/api/feedback/columns/${t.column.id}`, { method: 'PATCH', body: { name } })
          .then(() => loadAll())
          .catch((e: any) => toast.add({ title: 'Rename failed', description: e?.data?.statusMessage, color: 'error' }))
      }
    }
  }
}

async function onReorderColumn(payload: { draggedId: string; targetId: string }) {
  const prev = [...columns.value]
  const a = columns.value.findIndex(c => c.id === payload.draggedId)
  const b = columns.value.findIndex(c => c.id === payload.targetId)
  if (a < 0 || b < 0) return
  const [moved] = columns.value.splice(a, 1)
  columns.value.splice(b, 0, moved!)
  try {
    await $fetch('/api/feedback/columns/reorder', {
      method: 'PATCH',
      body: { draggedColumnId: payload.draggedId, targetColumnId: payload.targetId }
    })
    await loadAll()
  } catch (e: any) {
    columns.value = prev
    toast.add({ title: 'Reorder failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function onToggleProjectExpand(project: Project) {
  const target = !((project as any).is_expanded === true)
  const i = projects.value.findIndex(p => p.id === project.id)
  if (i < 0) return
  projects.value.splice(i, 1, { ...(projects.value[i] as any), is_expanded: target })
  try {
    await $fetch(`/api/feedback/projects/${project.id}`, {
      method: 'PATCH',
      body: { is_expanded: target }
    })
  } catch (e: any) {
    projects.value.splice(i, 1, project)
    toast.add({ title: 'Toggle failed', description: e?.data?.statusMessage || 'Error', color: 'error' })
  }
}

async function onReorderProjects(payload: { orderedIds: string[] }) {
  const prev = [...projects.value]
  projects.value = payload.orderedIds
    .map(id => projects.value.find(p => p.id === id))
    .filter((p): p is Project => !!p)
  try {
    await $fetch('/api/feedback/projects/reorder', {
      method: 'POST',
      body: { orderedIds: payload.orderedIds }
    })
  } catch (e: any) {
    projects.value = prev
    toast.add({ title: 'Reorder failed', description: e?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div class="shrink-0 bg-(--ui-bg-elevated) border-b border-(--ui-border) px-4 py-2 flex items-center gap-2">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <UIcon name="i-lucide-inbox" class="shrink-0" />
        <div class="min-w-0">
          <h1 class="font-semibold truncate text-sm sm:text-base">
            Feedback
          </h1>
        </div>
      </div>

      <span
        v-if="zoomLevel !== 100"
        class="text-[11px] text-(--ui-text-muted) font-mono shrink-0 select-none"
        title="Ctrl+scroll to zoom"
      >{{ zoomLevel }}%</span>

      <div class="flex items-center gap-2 shrink-0">
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-refresh-ccw"
          aria-label="Reload"
          @click="loadAll"
        />
        <UButton
          variant="soft"
          size="sm"
          icon="i-lucide-plus"
          @click="openCreateProject"
        >
          New project
        </UButton>
      </div>
    </div>

    <div class="flex-1 min-h-0 flex flex-col">
      <UAlert v-if="error" color="error" :title="error" class="m-4" />

      <div v-if="loading" class="py-12 text-center text-(--ui-text-muted)">
        Loading board…
      </div>

      <div v-else-if="projects.length === 0" class="py-12 text-center">
        <p class="text-(--ui-text-muted) mb-4">No projects yet.</p>
        <UButton icon="i-lucide-plus" @click="openCreateProject">Create your first project</UButton>
      </div>

      <div
        v-else
        class="flex-1 min-h-0 origin-top-left flex flex-col"
        :style="zoomLevel !== 100 ? { zoom: `${zoomLevel}%` } : {}"
      >
        <div
          v-if="zoomLevel === 100"
          class="absolute bottom-2 right-4 z-10 text-[11px] text-(--ui-text-muted) pointer-events-none select-none opacity-50"
        >
          Hold Ctrl + scroll to zoom
        </div>

        <ProjectsBoard
          :projects="projects"
          :columns="columns"
          :swimlanes="swimlanes"
          :cards="cards"
          :scope="scope"
          @add-card="openAddCard"
          @card-click="openCard"
          @card-context-menu="openCardCtx"
          @card-drop="onCardDrop"
          @add-swimlane="openAddSwimlane"
          @rename-project="openRenameProject"
          @delete-project="deleteProject"
          @reorder-column="onReorderColumn"
          @reorder-projects="onReorderProjects"
          @project-context-menu="openProjectCtx"
          @column-context-menu="openColumnCtx"
          @request-add-project="openCreateProject"
          @toggle-project-expand="onToggleProjectExpand"
        />
      </div>
    </div>

    <CardEditSidePanel
      v-model="cardPanelOpen"
      :card="activeCard"
      :columns="columns"
      :projects="projects"
      :users="assignableUsers"
      @save="onSaveCard"
      @delete="onDeleteCard"
    />

    <UModal v-model:open="projectModalOpen" :title="projectForm.mode === 'create' ? 'New project' : 'Rename project'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="projectForm.name" placeholder="e.g., Map A" autofocus />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="projectForm.description" :rows="2" />
          </UFormField>
          <UFormField
            v-if="projectForm.mode === 'edit'"
            label="Allowed widget origins"
            help="Sites where the embeddable feedback widget may sign users in (one origin per line, e.g. https://app.example.com). Leave empty to disable cross-origin sign-in."
          >
            <UTextarea
              v-model="projectForm.allowedOrigins"
              :rows="3"
              placeholder="https://app.example.com&#10;https://docs.example.com"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="projectModalOpen = false">Cancel</UButton>
          <UButton :loading="projectBusy" :disabled="!projectForm.name.trim()" @click="submitProject">
            {{ projectForm.mode === 'create' ? 'Create' : 'Save' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="swimlaneModalOpen" title="New swimlane">
      <template #body>
        <UFormField label="Name" required>
          <UInput v-model="swimlaneForm.name" placeholder="e.g., Mobile view" autofocus />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="swimlaneModalOpen = false">Cancel</UButton>
          <UButton :loading="swimlaneBusy" :disabled="!swimlaneForm.name.trim()" @click="submitSwimlane">
            Create
          </UButton>
        </div>
      </template>
    </UModal>

    <KanbanContextMenu
      v-model:open="ctxMenu.open"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :items="ctxMenu.items"
      @select="onCtxSelect"
    />

    <UModal v-model:open="cardModalOpen" title="New card">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Title" required>
            <UInput v-model="cardForm.title" placeholder="Briefly describe the card" autofocus />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="cardModalOpen = false">Cancel</UButton>
          <UButton :loading="cardBusy" :disabled="!cardForm.title.trim()" @click="submitCard">
            Create
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
