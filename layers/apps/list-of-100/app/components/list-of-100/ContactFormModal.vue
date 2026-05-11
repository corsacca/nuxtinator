<script setup lang="ts">
import type { ListContact, ContactFormState, RhythmEvent } from '../../utils/list-of-100-types'
import { FAITH_STATUSES, RELATIONSHIPS, relativeTime } from '../../utils/list-of-100-types'

const props = defineProps<{
  open: boolean
  contact?: ListContact | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: [contact: ListContact]
}>()

const isEdit = computed(() => !!props.contact)
const title = computed(() => isEdit.value ? props.contact?.name ?? 'Edit contact' : 'Add contact')

const state = reactive<ContactFormState>({
  name: '',
  relationship: 'friend',
  faith_status: 'unknown',
  notes: ''
})
const submitting = ref(false)
const error = ref<string | null>(null)

// History
const history = ref<RhythmEvent[]>([])
const historyLoading = ref(false)

async function loadHistory(contactId: string) {
  historyLoading.value = true
  try {
    const res = await $fetch<{ events: RhythmEvent[] }>(
      `/api/list-of-100/contacts/${contactId}/history`
    )
    history.value = res.events
  } catch {
    history.value = []
  } finally {
    historyLoading.value = false
  }
}

watch(() => [props.open, props.contact], ([open]) => {
  if (!open) return
  if (props.contact) {
    state.name = props.contact.name
    state.relationship = props.contact.relationship
    state.faith_status = props.contact.faith_status
    state.notes = props.contact.notes ?? ''
    loadHistory(props.contact.id)
  } else {
    state.name = ''
    state.relationship = 'friend'
    state.faith_status = 'unknown'
    state.notes = ''
    history.value = []
  }
  error.value = null
}, { immediate: true })

async function submit() {
  if (!state.name.trim()) {
    error.value = 'Name is required.'
    return
  }
  submitting.value = true
  error.value = null
  try {
    const body = {
      name: state.name.trim(),
      relationship: state.relationship,
      faith_status: state.faith_status,
      notes: state.notes.trim() || null
    }
    const res = isEdit.value
      ? await $fetch<{ contact: ListContact }>(`/api/list-of-100/contacts/${props.contact!.id}`, {
          method: 'PATCH',
          body
        })
      : await $fetch<{ contact: ListContact }>('/api/list-of-100/contacts', {
          method: 'POST',
          body
        })
    emit('saved', res.contact)
    emit('update:open', false)
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, statusMessage?: string }
    error.value = err?.data?.statusMessage ?? err?.statusMessage ?? 'Save failed'
  } finally {
    submitting.value = false
  }
}

const faithItems = FAITH_STATUSES.map(f => ({ label: f.label, value: f.value }))
const relationshipItems = RELATIONSHIPS

function eventLabel(e: RhythmEvent): string {
  return e.event_type === 'MARK_CONTACTED' ? 'Contacted' : 'Prayed for'
}
function eventIcon(e: RhythmEvent): string {
  return e.event_type === 'MARK_CONTACTED' ? 'i-lucide-message-circle' : 'i-lucide-hand-heart'
}
function eventColor(e: RhythmEvent): string {
  return e.event_type === 'MARK_CONTACTED' ? 'text-(--ui-info)' : 'text-(--ui-success)'
}
function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :ui="{ content: 'max-w-3xl' }"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <div
        class="grid gap-6"
        :class="isEdit ? 'md:grid-cols-2' : ''"
      >
        <form class="space-y-4" @submit.prevent="submit">
          <UFormField label="Name" required>
            <UInput
              v-model="state.name"
              placeholder="Their name"
              autofocus
              class="w-full"
            />
          </UFormField>

          <UFormField label="Relationship">
            <USelectMenu
              v-model="state.relationship"
              :items="relationshipItems"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Faith status">
            <URadioGroup
              v-model="state.faith_status"
              :items="faithItems"
              value-key="value"
              label-key="label"
              orientation="horizontal"
              color="primary"
            />
          </UFormField>

          <UFormField label="Notes" hint="Optional">
            <UTextarea
              v-model="state.notes"
              placeholder="Anything to remember…"
              :rows="3"
              autoresize
              class="w-full"
            />
          </UFormField>

          <p v-if="error" class="text-sm text-(--ui-error)">
            {{ error }}
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="submitting"
              @click="emit('update:open', false)"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="submitting"
            >
              {{ isEdit ? 'Save' : 'Add contact' }}
            </UButton>
          </div>
        </form>

        <div
          v-if="isEdit"
          class="md:border-l md:border-(--ui-border) md:pl-6 -mx-6 md:mx-0 px-6 md:px-0 pt-4 md:pt-0 border-t md:border-t-0 border-(--ui-border)"
        >
          <div class="text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mb-3">
            Rhythm
          </div>
          <div v-if="historyLoading" class="text-sm text-(--ui-text-muted)">
            Loading…
          </div>
          <div
            v-else-if="history.length === 0"
            class="text-sm text-(--ui-text-muted)"
          >
            No activity yet. Hit "Contacted" or "Prayed" on the list to start the rhythm.
          </div>
          <ul v-else class="space-y-2 max-h-96 overflow-y-auto pr-2">
            <li
              v-for="ev in history"
              :key="ev.id"
              class="flex items-start gap-3 text-sm"
            >
              <UIcon :name="eventIcon(ev)" :class="['mt-0.5 shrink-0', eventColor(ev)]" />
              <div class="min-w-0">
                <div class="font-medium">
                  {{ eventLabel(ev) }}
                </div>
                <div class="text-xs text-(--ui-text-muted)">
                  {{ relativeTime(ev.timestamp) }} · {{ fullDate(ev.timestamp) }}
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </UModal>
</template>
