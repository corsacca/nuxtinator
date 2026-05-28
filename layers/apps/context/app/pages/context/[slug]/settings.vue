<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const slug = computed(() => String(route.params.slug ?? ''))

interface PortfolioRow {
  id: string
  slug: string
  name: string
  color: string | null
  icon_url: string | null
}

const { data } = await useAsyncData(
  () => `context-portfolio-settings-${slug.value}`,
  () => $fetch<PortfolioRow>(`/api/context/portfolios/${slug.value}`)
)
const form = reactive({ name: data.value?.name ?? '', color: data.value?.color ?? '#7c3aed' })
const saving = ref(false)
const deleting = ref(false)
const sidebarOpen = ref(false)

watch(data, (next) => {
  if (next) {
    form.name = next.name
    form.color = next.color ?? '#7c3aed'
  }
})

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/context/portfolios/${slug.value}`, {
      method: 'PATCH',
      body: { name: form.name, color: form.color || null }
    })
    await refreshNuxtData('context-sidebar-portfolios')
  } finally {
    saving.value = false
  }
}

async function deletePortfolio() {
  if (!confirm(`Delete "${form.name}"? This cannot be undone.`)) return
  deleting.value = true
  try {
    await $fetch(`/api/context/portfolios/${slug.value}`, { method: 'DELETE' })
    await refreshNuxtData('context-sidebar-portfolios')
    router.push('/context')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] -mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8">
    <ContextSidebar v-model:open="sidebarOpen" />

    <section class="flex-1 flex flex-col min-w-0 border-l-0 lg:border-l border-(--ui-border) overflow-hidden">
      <header class="flex items-center gap-2 px-3 py-2 border-b border-(--ui-border) bg-(--ui-bg)">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Open sidebar"
          @click="sidebarOpen = true"
        />
        <UButton variant="ghost" icon="i-lucide-arrow-left" size="sm" :to="`/context/${slug}`" />
        <h1 class="font-semibold">
          Portfolio settings
        </h1>
      </header>

      <div class="flex-1 overflow-auto p-6">
        <div class="max-w-2xl mx-auto space-y-8">
          <section class="space-y-4">
            <h2 class="text-lg font-semibold">
              Basics
            </h2>
            <UFormField label="Name">
              <UInput v-model="form.name" />
            </UFormField>
            <UFormField label="Color">
              <UInput v-model="form.color" type="color" />
            </UFormField>
            <UFormField label="Icon">
              <ContextIconUpload :slug="slug" :icon-url="data?.icon_url ?? null" />
            </UFormField>
            <UButton color="primary" :loading="saving" @click="save">
              Save
            </UButton>
          </section>

          <section class="space-y-4">
            <h2 class="text-lg font-semibold">
              Custom sections
            </h2>
            <ContextCustomSectionsManager :slug="slug" />
          </section>

          <section class="space-y-4 border-t border-(--ui-border) pt-8">
            <h2 class="text-lg font-semibold text-(--ui-error)">
              Danger zone
            </h2>
            <UButton color="error" variant="outline" :loading="deleting" @click="deletePortfolio">
              Delete portfolio
            </UButton>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>
