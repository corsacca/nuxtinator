<script setup lang="ts">
// Detail-page header: back link to the list, click-to-rename name (only when
// the caller can edit this record), a status badge colored from the status
// field's option settings, and the share popover (share/unshare land on the
// record's timeline, hence the shareChanged re-emit). `canEdit`/`canShare`
// are the record detail's server-evaluated capabilities.
import type { CrmFieldSetting } from '../../utils/field-kinds'
import type { CrmRecordDetail } from '../../composables/useCrmRecord'

const props = defineProps<{
  record: CrmRecordDetail
  statusField: CrmFieldSetting | null
  backTo: string
  backLabel: string
  canEdit: boolean
  canShare: boolean
}>()

const emit = defineEmits<{
  rename: [name: string]
  shareChanged: []
}>()

const editing = ref(false)
const draft = ref('')
const nameInput = ref<{ inputRef?: HTMLInputElement } | null>(null)

function beginEdit() {
  if (!props.canEdit) return
  draft.value = props.record.name
  editing.value = true
  nextTick(() => nameInput.value?.inputRef?.focus())
}

function commit() {
  if (!editing.value) return
  editing.value = false
  const next = draft.value.trim()
  if (next !== '' && next !== props.record.name) emit('rename', next)
}

function cancel() {
  editing.value = false
}

function blurTarget(event: Event) {
  (event.target as HTMLElement).blur()
}
</script>

<template>
  <div class="space-y-2">
    <NuxtLink
      :to="backTo"
      class="inline-flex items-center gap-1 text-sm text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-4"
      />
      {{ backLabel }}
    </NuxtLink>

    <div class="flex items-center gap-3 flex-wrap">
      <h1
        v-if="!editing"
        class="text-2xl font-bold rounded px-1 -mx-1"
        :class="canEdit ? 'cursor-text hover:bg-(--ui-bg-elevated)' : ''"
        :title="canEdit ? 'Click to rename' : undefined"
        @click="beginEdit"
      >
        {{ record.name || '—' }}
      </h1>
      <UInput
        v-else
        ref="nameInput"
        v-model="draft"
        size="lg"
        class="w-full max-w-md"
        @blur="commit"
        @keydown.enter.prevent="blurTarget"
        @keydown.esc.prevent="cancel"
      />
      <UBadge
        v-if="statusField && record.status"
        :color="crmOptionColor(statusField, record.status)"
        variant="subtle"
        size="lg"
      >
        {{ crmOptionLabel(statusField, record.status) }}
      </UBadge>
      <CrmSharePopover
        class="ml-auto"
        :record-id="record.id"
        :type-key="record.typeKey"
        :can-share="canShare"
        @changed="emit('shareChanged')"
      />
    </div>
  </div>
</template>
