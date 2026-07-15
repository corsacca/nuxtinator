<script setup lang="ts">
// Detail-page panel aggregating every connection field: linked records as
// chips that navigate to their detail pages. Values arrive hydrated as
// { id, name } from the detail GET, so no per-record lookups happen here.
// Renders nothing when the record has no connections.
import type { CrmConnectedRecord } from '#crm'
import type { CrmFieldSetting } from '../../utils/field-kinds'
import type { CrmRecordDetail } from '../../composables/useCrmRecord'

const props = defineProps<{
  fields: CrmFieldSetting[]
  record: CrmRecordDetail
}>()

const crmPath = useCrmPath()

interface ConnectionGroup {
  field: CrmFieldSetting
  items: CrmConnectedRecord[]
}

function valuesOf(field: CrmFieldSetting): CrmConnectedRecord[] {
  const raw = props.record.fields[field.key]
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is CrmConnectedRecord =>
    v !== null && typeof v === 'object' && 'id' in v && 'name' in v
  )
}

const groups = computed<ConnectionGroup[]>(() =>
  props.fields
    .filter(f => f.kind === 'connection' && !f.hidden && !f.orphan)
    .map(field => ({ field, items: valuesOf(field) }))
    .filter(g => g.items.length > 0)
)
</script>

<template>
  <CrmFieldSection
    v-if="groups.length > 0"
    label="Connections"
  >
    <div
      v-for="group in groups"
      :key="group.field.key"
      class="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 sm:gap-4 px-4 py-3"
    >
      <div class="text-sm text-(--ui-text-muted) sm:pt-1">
        {{ group.field.label }}
      </div>
      <div class="flex flex-wrap gap-1.5 min-w-0">
        <UButton
          v-for="item in group.items"
          :key="item.id"
          :to="crmPath(`/${group.field.target}/${item.id}`)"
          color="neutral"
          variant="subtle"
          size="xs"
          icon="i-lucide-link"
        >
          {{ item.name }}
        </UButton>
      </div>
    </div>
  </CrmFieldSection>
</template>
