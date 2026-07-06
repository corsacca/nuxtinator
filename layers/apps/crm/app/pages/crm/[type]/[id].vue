<script setup lang="ts">
// Record detail: header (back link, click-to-rename name, status badge) and
// the field sections in declared order. Editable kinds commit inline
// through the optimistic patchFields; other kinds render read-only until
// their editors ship.
import type { CrmTypeFields } from '../../../composables/useCrmTypes'
import type { CrmFieldSetting } from '../../../utils/field-kinds'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const typeKey = computed(() => String(route.params.type ?? ''))
const recordId = computed(() => String(route.params.id ?? ''))

const { types, ensureTypes, getFields } = useCrmTypes()
const crmPath = useCrmPath()
const toast = useToast()

onMounted(() => {
  ensureTypes().catch(() => {
    // The fields fetch below reports errors; the back label falls back.
  })
})

const typeInfo = computed(() => types.value.find(t => t.key === typeKey.value) ?? null)

const fieldSettings = ref<CrmTypeFields | null>(null)
const fieldsError = ref<string | null>(null)
watch(typeKey, async (key) => {
  fieldSettings.value = null
  fieldsError.value = null
  if (!key) return
  try {
    const res = await getFields(key)
    if (key === typeKey.value) fieldSettings.value = res
  } catch (err) {
    if (key === typeKey.value) fieldsError.value = crmErrorMessage(err, 'Failed to load record type')
  }
}, { immediate: true })

const { record, pending, error, patchFields } = useCrmRecord(typeKey, recordId)

const statusField = computed(() =>
  fieldSettings.value?.fields.find(f => f.key === 'status' && f.kind === 'key_select') ?? null
)

interface SectionGroup {
  key: string
  label: string
  fields: CrmFieldSetting[]
}

// Sections in their declared order, each with its visible fields (the
// endpoint returns fields sorted by order). The name field renders in the
// header, not as a row. Fields without a section — or referencing an
// unknown key — collect in a trailing group.
const sectionGroups = computed<SectionGroup[]>(() => {
  const def = fieldSettings.value
  if (!def) return []
  const visible = def.fields.filter(f => !f.hidden && !f.orphan && f.key !== 'name')
  const known = new Set(Object.keys(def.sections))
  const groups = Object.entries(def.sections)
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
    .map(([key, section]) => ({
      key,
      label: section.label,
      fields: visible.filter(f => f.section === key)
    }))
  const rest = visible.filter(f => !f.section || !known.has(f.section))
  if (rest.length > 0) groups.push({ key: '_other', label: 'Other', fields: rest })
  return groups.filter(g => g.fields.length > 0)
})

function fieldValue(field: CrmFieldSetting): unknown {
  return record.value?.fields[field.key] ?? null
}

async function commitField(field: CrmFieldSetting, value: unknown) {
  try {
    await patchFields({ [field.key]: value })
  } catch (err) {
    toast.add({
      title: 'Update failed',
      description: crmErrorMessage(err, `Failed to update ${field.label}`),
      color: 'error'
    })
  }
}

async function rename(name: string) {
  try {
    await patchFields({ name })
  } catch (err) {
    toast.add({
      title: 'Rename failed',
      description: crmErrorMessage(err, 'Failed to rename record'),
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <UAlert
      v-if="error || fieldsError"
      color="error"
      :title="error || fieldsError || 'Something went wrong'"
    />

    <template v-else-if="record">
      <CrmRecordHeader
        :record="record"
        :status-field="statusField"
        :back-to="crmPath(`/${typeKey}`)"
        :back-label="typeInfo?.label ?? 'Back'"
        @rename="rename"
      />

      <CrmFieldSection
        v-for="group in sectionGroups"
        :key="group.key"
        :label="group.label"
      >
        <CrmFieldRow
          v-for="field in group.fields"
          :key="field.key"
          :field="field"
          :value="fieldValue(field)"
          @commit="commitField(field, $event)"
        />
      </CrmFieldSection>

      <p class="text-xs text-(--ui-text-muted)">
        Created {{ new Date(record.createdAt).toLocaleString() }}
        · Updated {{ new Date(record.updatedAt).toLocaleString() }}
      </p>
    </template>

    <div
      v-else-if="pending"
      class="grid place-items-center py-24 text-(--ui-text-muted)"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin"
      />
    </div>
  </div>
</template>
