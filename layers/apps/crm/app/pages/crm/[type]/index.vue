<script setup lang="ts">
// Records list for one type: sidebar type switcher, search/status filters,
// sortable table, pagination, and the create modal. List state (q, status,
// sort, dir, page) lives in the URL via useCrmRecords.
import type { CrmTypeFields } from '../../../composables/useCrmTypes'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const typeKey = computed(() => String(route.params.type ?? ''))

const { types, ensureTypes, getFields } = useCrmTypes()

onMounted(() => {
  ensureTypes().catch(() => {
    // The fields fetch below reports errors; the catalog retries with it.
  })
})

const typeInfo = computed(() => types.value.find(t => t.key === typeKey.value) ?? null)
const typeLabel = computed(() => typeInfo.value?.label ?? typeKey.value)
const labelSingular = computed(() => typeInfo.value?.labelSingular ?? 'record')

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

const {
  items, total, pending, error, page, pageSize,
  q, status, sort, dir, toggleSort, refresh
} = useCrmRecords(typeKey)

const statusField = computed(() =>
  fieldSettings.value?.fields.find(f => f.key === 'status' && f.kind === 'key_select') ?? null
)

const sidebarOpen = ref(false)
const createOpen = ref(false)

const isFiltered = computed(() => q.value !== '' || status.value !== null)
const showEmpty = computed(() =>
  !pending.value && total.value === 0 && !isFiltered.value && !error.value && !fieldsError.value
)
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
    <CrmSidebar v-model:open="sidebarOpen" />

    <section class="flex-1 flex flex-col min-w-0 border-l-0 lg:border-l border-(--ui-border) overflow-hidden">
      <header class="flex items-center gap-2 px-4 py-3 border-b border-(--ui-border) bg-(--ui-bg)">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Open record types"
          @click="sidebarOpen = true"
        />
        <h1 class="flex-1 text-lg font-semibold truncate">
          {{ typeLabel }}
        </h1>
        <UButton
          icon="i-lucide-plus"
          @click="createOpen = true"
        >
          New {{ labelSingular.toLowerCase() }}
        </UButton>
      </header>

      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <CrmRecordFilters
          v-model:q="q"
          v-model:status="status"
          :status-field="statusField"
        />

        <UAlert
          v-if="fieldsError || error"
          color="error"
          :title="fieldsError || error || 'Something went wrong'"
        />

        <CrmEmptyState
          v-else-if="showEmpty"
          :type-label="typeLabel"
          :label-singular="labelSingular"
          @create="createOpen = true"
        />

        <template v-else>
          <CrmRecordTable
            :type-key="typeKey"
            :items="items"
            :fields="fieldSettings?.fields ?? []"
            :loading="pending"
            :sort="sort"
            :dir="dir"
            @toggle-sort="toggleSort"
          />

          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="text-sm text-(--ui-text-muted)">
              {{ total }} record{{ total === 1 ? '' : 's' }}
            </span>
            <UPagination
              v-model:page="page"
              :items-per-page="pageSize"
              :total="total"
            />
          </div>
        </template>
      </div>
    </section>

    <CrmRecordCreateModal
      v-model:open="createOpen"
      :type-key="typeKey"
      :label-singular="labelSingular"
      :fields="fieldSettings?.fields ?? []"
      @created="refresh"
    />
  </div>
</template>
