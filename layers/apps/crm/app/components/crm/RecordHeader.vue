<script setup lang="ts">
// Detail-page header: back link to the list, click-to-rename name, and a
// status badge colored from the status field's option settings.
import type { CrmFieldSetting } from '../../utils/field-kinds'
import type { CrmRecordDetail } from '../../composables/useCrmRecord'

const props = defineProps<{
  record: CrmRecordDetail
  statusField: CrmFieldSetting | null
  backTo: string
  backLabel: string
}>()

const emit = defineEmits<{
  rename: [name: string]
}>()

const editing = ref(false)
const draft = ref('')
const nameInput = ref<{ inputRef?: HTMLInputElement } | null>(null)

function beginEdit() {
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
        class="text-2xl font-bold cursor-text rounded px-1 -mx-1 hover:bg-(--ui-bg-elevated)"
        title="Click to rename"
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
    </div>
  </div>
</template>
