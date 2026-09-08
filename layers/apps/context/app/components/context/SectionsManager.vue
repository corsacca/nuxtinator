<script setup lang="ts">
// Manage a portfolio's section definitions: every section (built-in and
// custom) with a remove action, plus controls to add a missing built-in or a
// new custom section. `list` off shows only the add controls, for pages that
// already render the sections themselves.
import { CONTEXT_SECTIONS } from '../../utils/section-catalog'

const props = withDefaults(defineProps<{ slug: string, list?: boolean }>(), { list: true })
const emit = defineEmits(['changed'])

interface SectionDef {
  id: string
  key: string
  title: string
  description: string
  order: number
  is_custom: boolean
}

const { hasPermission } = usePermissions()
const canManage = computed(() => hasPermission('context.section.custom'))

const { data, refresh } = await useAsyncData(
  () => `context-manage-sections-${props.slug}`,
  () => $fetch<{ sections: SectionDef[] }, string>(`/api/context/portfolios/${props.slug}/sections`)
)
const sections = computed(() => data.value?.sections ?? [])
const missingBuiltins = computed(() => {
  const present = new Set(sections.value.map(s => s.key))
  return CONTEXT_SECTIONS.filter(s => !present.has(s.key)).map(s => ({ label: s.title, value: s.key }))
})

const builtinToAdd = ref<string | undefined>(undefined)
const form = reactive({ title: '', description: '' })
const adding = ref(false)
const error = ref<string | null>(null)

const removeTarget = ref<SectionDef | null>(null)
const removeOpen = ref(false)
const removing = ref(false)

async function afterChange() {
  await refresh()
  await refreshNuxtData([`context-sidebar-sections-${props.slug}`, `context-sections-${props.slug}`])
  emit('changed')
}

async function add(body: { key: string } | { title: string, description?: string }) {
  adding.value = true
  error.value = null
  try {
    await $fetch(`/api/context/portfolios/${props.slug}/sections`, { method: 'POST', body })
    await afterChange()
    return true
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? 'Add failed.'
    return false
  } finally {
    adding.value = false
  }
}

async function addBuiltin() {
  if (!builtinToAdd.value) return
  if (await add({ key: builtinToAdd.value })) builtinToAdd.value = undefined
}

async function addCustom() {
  if (!form.title.trim()) return
  if (await add({ title: form.title.trim(), description: form.description.trim() || undefined })) {
    form.title = ''
    form.description = ''
  }
}

function askRemove(section: SectionDef) {
  removeTarget.value = section
  removeOpen.value = true
}

async function remove() {
  const target = removeTarget.value
  if (!target) return
  removing.value = true
  error.value = null
  try {
    await $fetch(`/api/context/portfolios/${props.slug}/sections/${target.key}`, { method: 'DELETE' })
    removeOpen.value = false
    await afterChange()
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? 'Remove failed.'
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <ul v-if="list && sections.length" class="divide-y divide-(--ui-border) border border-(--ui-border) rounded">
      <li v-for="s in sections" :key="s.key" class="flex items-center justify-between gap-3 p-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ s.title }}</span>
            <UBadge v-if="s.is_custom" variant="subtle" color="neutral" size="xs">
              Custom
            </UBadge>
          </div>
          <div class="text-sm text-(--ui-text-muted)">
            <code class="text-xs">{{ s.key }}</code>
            <span v-if="s.description"> · {{ s.description }}</span>
          </div>
        </div>
        <UButton
          v-if="canManage"
          variant="ghost"
          color="error"
          icon="i-lucide-trash"
          size="sm"
          :aria-label="`Remove ${s.title}`"
          @click="askRemove(s)"
        />
      </li>
    </ul>
    <p v-else-if="list" class="text-sm text-(--ui-text-muted)">
      This portfolio has no sections yet.
    </p>

    <template v-if="canManage">
      <form v-if="missingBuiltins.length" class="flex flex-col gap-2 sm:flex-row sm:items-end" @submit.prevent="addBuiltin">
        <UFormField label="Add a built-in section" class="flex-1">
          <USelect v-model="builtinToAdd" :items="missingBuiltins" placeholder="Choose a section" class="w-full" />
        </UFormField>
        <UButton type="submit" variant="outline" :loading="adding" :disabled="!builtinToAdd">
          Add
        </UButton>
      </form>

      <form class="flex flex-col gap-2 sm:flex-row sm:items-end" @submit.prevent="addCustom">
        <UFormField label="Add a custom section" class="flex-1">
          <UInput v-model="form.title" placeholder="e.g. Roadmap" class="w-full" />
        </UFormField>
        <UFormField label="Description (optional)" class="flex-1">
          <UInput v-model="form.description" class="w-full" />
        </UFormField>
        <UButton type="submit" :loading="adding">
          Add
        </UButton>
      </form>
    </template>

    <p v-if="error" class="text-(--ui-error) text-sm">
      {{ error }}
    </p>

    <ContextConfirmModal
      v-model:open="removeOpen"
      :title="`Remove ${removeTarget?.title ?? 'section'}?`"
      description="Its content is kept and comes back if you add the section again."
      confirm-label="Remove"
      :loading="removing"
      @confirm="remove"
    />
  </div>
</template>
