<script setup lang="ts">
// Operator-admin triage queue. Lists feedback cards across all projects in
// the active org, lets the admin set status (new / triage_needed / in_progress
// / accepted / rejected) and add admin_notes / external_reference.

definePageMeta({
  middleware: 'auth'
})

interface FeedbackCard {
  id: string
  project_id: string
  title: string
  created_at: string
  updated_at: string
  post_meta: Record<string, any>
  column_id: string | null
}

interface Attachment {
  id: string
  kind: 'screenshot' | 'attachment'
  filename: string
  mime_type: string
  size_bytes: number
  url: string
  created_at: string
}

const toast = useToast()
const cards = ref<FeedbackCard[]>([])
const projectNames = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')

const selected = ref<FeedbackCard | null>(null)
const attachments = ref<Attachment[]>([])
const attachmentsBusy = ref(false)
const draftStatus = ref('new')
const draftAdminNotes = ref('')
const draftExtRef = ref('')
const saving = ref(false)

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    // List projects + their feedback cards. RLS filters to the active org.
    const projects = await $fetch<Array<{ id: string; name: string }>>('/api/feedback/projects')
    projectNames.value = Object.fromEntries(projects.map(p => [p.id, p.name]))

    const cardLists = await Promise.all(
      projects.map(p =>
        $fetch<FeedbackCard[]>('/api/feedback/cards', {
          query: { project_id: p.id, post_type: 'feedback' }
        })
      )
    )
    cards.value = cardLists.flat().sort((a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at)
    )
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.message || 'Failed to load feedback'
  } finally {
    loading.value = false
  }
}

async function selectCard(card: FeedbackCard) {
  selected.value = card
  draftStatus.value = (card.post_meta?.status as string) || 'new'
  draftAdminNotes.value = (card.post_meta?.admin_notes as string) || ''
  draftExtRef.value = (card.post_meta?.external_reference as string) || ''
  attachments.value = []
  attachmentsBusy.value = true
  try {
    attachments.value = await $fetch<Attachment[]>(`/api/admin/feedback/${card.id}/attachments`)
  } catch (e: any) {
    toast.add({ title: 'Failed to load attachments', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    attachmentsBusy.value = false
  }
}

async function saveTriage() {
  if (!selected.value) return
  saving.value = true
  try {
    await $fetch(`/api/admin/feedback/${selected.value.id}`, {
      method: 'PATCH',
      body: {
        status: draftStatus.value,
        admin_notes: draftAdminNotes.value,
        external_reference: draftExtRef.value
      }
    })
    toast.add({ title: 'Saved', color: 'success', duration: 1500 })
    await loadAll()
    const fresh = cards.value.find(c => c.id === selected.value!.id)
    if (fresh) selected.value = fresh
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function statusBadgeColor(s: string) {
  switch (s) {
    case 'new': return 'info'
    case 'triage_needed': return 'warning'
    case 'in_progress': return 'primary'
    case 'accepted': return 'success'
    case 'rejected': return 'error'
    default: return 'neutral'
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div class="shrink-0 bg-(--ui-bg-elevated) border-b border-(--ui-border) px-4 py-2 flex items-center gap-2">
      <UIcon name="i-lucide-message-square-warning" />
      <h1 class="font-semibold text-base">Feedback Triage</h1>
      <UButton
        class="ml-auto"
        variant="ghost"
        size="sm"
        icon="i-lucide-refresh-ccw"
        aria-label="Reload"
        @click="loadAll"
      />
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-12 gap-0">
      <div class="col-span-5 border-r border-(--ui-border) overflow-y-auto">
        <UAlert v-if="error" color="error" :title="error" class="m-4" />
        <div v-if="loading" class="py-12 text-center text-(--ui-text-muted)">Loading…</div>
        <div v-else-if="cards.length === 0" class="py-12 text-center text-(--ui-text-muted) italic">
          No feedback submissions yet.
        </div>
        <ul v-else class="divide-y divide-(--ui-border)">
          <li
            v-for="card in cards"
            :key="card.id"
            class="px-4 py-3 cursor-pointer transition-colors hover:bg-(--ui-bg-accented)"
            :class="selected?.id === card.id ? 'bg-(--ui-bg-accented)' : ''"
            @click="selectCard(card)"
          >
            <div class="flex items-start justify-between gap-2">
              <h3 class="text-sm font-medium truncate flex-1">{{ card.title || '(Untitled)' }}</h3>
              <UBadge
                :color="statusBadgeColor((card.post_meta?.status as string) || 'new')"
                variant="soft"
                size="xs"
              >
                {{ (card.post_meta?.status as string) || 'new' }}
              </UBadge>
            </div>
            <p class="text-xs text-(--ui-text-muted) mt-1 truncate">
              {{ projectNames[card.project_id] || card.project_id }} · {{ fmtDate(card.created_at) }}
            </p>
            <p v-if="card.post_meta?.submitter_name" class="text-xs text-(--ui-text-muted) mt-0.5 truncate">
              from {{ card.post_meta.submitter_name }}
            </p>
          </li>
        </ul>
      </div>

      <div class="col-span-7 overflow-y-auto p-6">
        <div v-if="!selected" class="text-(--ui-text-muted) italic">
          Select a feedback item from the left to triage.
        </div>
        <div v-else class="space-y-6">
          <header>
            <h2 class="text-lg font-semibold">{{ selected.title || '(Untitled)' }}</h2>
            <p class="text-xs text-(--ui-text-muted) mt-1">
              {{ projectNames[selected.project_id] || selected.project_id }} · submitted {{ fmtDate(selected.created_at) }}
            </p>
          </header>

          <section v-if="selected.post_meta?.problem_description || selected.post_meta?.suggested_fix || selected.post_meta?.reported_element" class="space-y-3 text-sm">
            <div v-if="selected.post_meta.reported_element">
              <div class="text-xs font-semibold uppercase text-(--ui-text-muted)">Reported element</div>
              <p class="whitespace-pre-wrap">{{ selected.post_meta.reported_element }}</p>
            </div>
            <div v-if="selected.post_meta.problem_description">
              <div class="text-xs font-semibold uppercase text-(--ui-text-muted)">Problem</div>
              <p class="whitespace-pre-wrap">{{ selected.post_meta.problem_description }}</p>
            </div>
            <div v-if="selected.post_meta.suggested_fix">
              <div class="text-xs font-semibold uppercase text-(--ui-text-muted)">Suggested fix</div>
              <p class="whitespace-pre-wrap">{{ selected.post_meta.suggested_fix }}</p>
            </div>
            <div v-if="selected.post_meta.page_url" class="text-xs">
              <a :href="selected.post_meta.page_url" target="_blank" rel="noopener noreferrer" class="text-(--ui-primary) hover:underline">
                {{ selected.post_meta.page_url }}
              </a>
            </div>
          </section>

          <section v-if="attachments.length || attachmentsBusy" class="space-y-2 pt-4 border-t border-(--ui-border)">
            <h3 class="text-xs font-semibold uppercase text-(--ui-text-muted)">Attachments</h3>
            <div v-if="attachmentsBusy" class="text-sm text-(--ui-text-muted) italic">Loading…</div>
            <ul v-else class="space-y-1">
              <li v-for="a in attachments" :key="a.id" class="flex items-center gap-2 text-sm">
                <UIcon :name="a.kind === 'screenshot' ? 'i-lucide-image' : 'i-lucide-paperclip'" class="shrink-0" />
                <a :href="a.url" target="_blank" rel="noopener noreferrer" class="text-(--ui-primary) hover:underline truncate flex-1">
                  {{ a.filename }}
                </a>
                <span class="text-xs text-(--ui-text-muted) shrink-0">{{ Math.round(a.size_bytes / 1024) }} KB</span>
              </li>
            </ul>
          </section>

          <section class="space-y-3 pt-4 border-t border-(--ui-border)">
            <h3 class="text-xs font-semibold uppercase text-(--ui-text-muted)">Triage</h3>
            <UFormField label="Status">
              <USelect
                v-model="draftStatus"
                :items="[
                  { label: 'New', value: 'new' },
                  { label: 'Triage needed', value: 'triage_needed' },
                  { label: 'In progress', value: 'in_progress' },
                  { label: 'Accepted', value: 'accepted' },
                  { label: 'Rejected', value: 'rejected' }
                ]"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Admin notes">
              <UTextarea v-model="draftAdminNotes" :rows="3" placeholder="Internal notes (not visible to submitter)" class="w-full" />
            </UFormField>
            <UFormField label="External reference">
              <UInput v-model="draftExtRef" placeholder="Linear / Jira / GitHub issue URL or ID" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton :loading="saving" icon="i-lucide-save" @click="saveTriage">Save</UButton>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
