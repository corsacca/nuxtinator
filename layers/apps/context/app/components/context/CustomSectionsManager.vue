<script setup lang="ts">
interface Props { slug: string }
const props = defineProps<Props>()
const emit = defineEmits(['changed'])

interface CustomDef {
  id: string
  key: string
  title: string
  description: string
  order: number
}

const { data, refresh } = await useAsyncData(
  () => `context-custom-sections-${props.slug}`,
  () => $fetch<{ custom_sections: CustomDef[] }>(`/api/context/portfolios/${props.slug}/custom-sections`)
)
const customs = computed(() => data.value?.custom_sections ?? [])
const form = reactive({ title: '', description: '' })
const adding = ref(false)
const error = ref<string | null>(null)

async function add() {
  if (!form.title.trim()) return
  adding.value = true
  error.value = null
  try {
    await $fetch(`/api/context/portfolios/${props.slug}/custom-sections`, {
      method: 'POST',
      body: { title: form.title.trim(), description: form.description.trim() || undefined }
    })
    form.title = ''
    form.description = ''
    await refresh()
    await refreshNuxtData(`context-sidebar-sections-${props.slug}`)
    emit('changed')
  } catch (e) {
    error.value = (e as Error).message ?? 'Add failed.'
  } finally {
    adding.value = false
  }
}

async function remove(id: string) {
  if (!confirm('Remove this custom section? Existing content remains but will be hidden until you re-add.')) return
  await $fetch(`/api/context/portfolios/${props.slug}/custom-sections/${id}`, { method: 'DELETE' })
  await refresh()
  await refreshNuxtData(`context-sidebar-sections-${props.slug}`)
  emit('changed')
}
</script>

<template>
  <div class="space-y-3">
    <ul v-if="customs.length" class="divide-y divide-(--ui-border) border border-(--ui-border) rounded">
      <li v-for="c in customs" :key="c.id" class="flex items-center justify-between p-3">
        <div>
          <div class="font-medium">
            {{ c.title }}
          </div>
          <div class="text-sm text-(--ui-text-muted)">
            <code class="text-xs">{{ c.key }}</code>
            <span v-if="c.description"> · {{ c.description }}</span>
          </div>
        </div>
        <UButton variant="ghost" color="error" icon="i-lucide-trash" size="sm" @click="remove(c.id)" />
      </li>
    </ul>

    <form class="flex flex-col gap-2 sm:flex-row sm:items-end" @submit.prevent="add">
      <UFormField label="Title" class="flex-1">
        <UInput v-model="form.title" placeholder="e.g. Roadmap" />
      </UFormField>
      <UFormField label="Description (optional)" class="flex-1">
        <UInput v-model="form.description" />
      </UFormField>
      <UButton type="submit" :loading="adding">
        Add
      </UButton>
    </form>
    <p v-if="error" class="text-(--ui-error) text-sm">
      {{ error }}
    </p>
  </div>
</template>
