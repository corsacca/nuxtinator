<script setup lang="ts">
// Version history panel for a doc: lists snapshots, shows a line diff between a
// selected snapshot and the current content, and restores a snapshot.
import { lineDiff } from '../../utils/line-diff'
import type { FilesVersion } from '../../composables/useFiles'

const props = defineProps<{
  versions: FilesVersion[]
  currentBody: string
  restoring?: boolean
}>()

const emit = defineEmits<{ restore: [versionId: string] }>()

const selectedId = ref<string | null>(null)
const selected = computed(() => props.versions.find(v => v.id === selectedId.value) ?? null)

const diff = computed(() => {
  if (!selected.value) return null
  return lineDiff(selected.value.content, props.currentBody)
})

function fmt(ts: string): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="versions.length === 0" class="text-sm text-(--ui-text-muted) italic">
      No versions yet.
    </p>

    <ul v-else class="flex flex-col gap-1">
      <li
        v-for="(v, idx) in versions"
        :key="v.id"
        class="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-(--ui-bg-elevated)"
        :class="{ 'bg-(--ui-bg-elevated)': selectedId === v.id }"
        @click="selectedId = selectedId === v.id ? null : v.id"
      >
        <UIcon name="i-lucide-history" class="size-4 text-(--ui-text-muted)" />
        <div class="flex-1 min-w-0">
          <div class="text-sm truncate">
            {{ fmt(v.edited_at) }}
            <UBadge v-if="idx === 0" label="current" color="primary" variant="soft" size="sm" class="ml-1" />
          </div>
          <div class="text-xs text-(--ui-text-muted) truncate">
            {{ v.edited_by_name ?? 'Unknown' }} · "{{ v.title }}"
          </div>
        </div>
        <UButton
          v-if="idx !== 0"
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-rotate-ccw"
          :loading="restoring"
          @click.stop="emit('restore', v.id)"
        >
          Restore
        </UButton>
      </li>
    </ul>

    <div v-if="diff" class="rounded-lg border border-(--ui-border) overflow-hidden">
      <div class="px-3 py-2 text-xs font-medium border-b border-(--ui-border) bg-(--ui-bg-elevated)">
        Changes from this version → current
      </div>
      <pre class="files-diff"><template v-for="(op, i) in diff" :key="i"><span
        :class="{
          'files-diff-add': op.type === 'add',
          'files-diff-remove': op.type === 'remove'
        }"
      >{{ op.type === 'add' ? '+ ' : op.type === 'remove' ? '- ' : '  ' }}{{ op.text }}
</span></template></pre>
    </div>
  </div>
</template>

<style scoped>
.files-diff {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 24rem;
  overflow-y: auto;
}
.files-diff-add {
  display: block;
  background: color-mix(in oklch, var(--ui-color-success-500) 18%, transparent);
}
.files-diff-remove {
  display: block;
  background: color-mix(in oklch, var(--ui-color-error-500) 18%, transparent);
}
</style>
