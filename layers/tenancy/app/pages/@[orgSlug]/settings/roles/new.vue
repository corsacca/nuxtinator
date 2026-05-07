<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const orgSlug = computed(() => route.params.orgSlug as string)
const toast = useToast()

interface PermissionItem {
  perm: string
  title: string
  description: string
}

const { data: permsData } = await useFetch<{ permissions: PermissionItem[] }>(
  () => `/api/o/${orgSlug.value}/permissions`,
  { watch: [orgSlug], default: () => ({ permissions: [] }) }
)
const allPerms = computed(() => permsData.value?.permissions ?? [])

const name = ref('')
const description = ref('')
const selected = ref<Set<string>>(new Set())

const toggle = (p: string) => {
  const next = new Set(selected.value)
  if (next.has(p)) next.delete(p)
  else next.add(p)
  selected.value = next
}

const saving = ref(false)
const submit = async () => {
  saving.value = true
  try {
    const res = await $fetch<{ id: string }>(
      `/api/o/${orgSlug.value}/roles`,
      {
        method: 'POST',
        body: {
          name: name.value.trim(),
          description: description.value.trim(),
          permissions: [...selected.value]
        }
      }
    )
    toast.add({ title: 'Role created', color: 'success' })
    await router.push(`/@${orgSlug.value}/settings/roles/${res.id}`)
  } catch (err: unknown) {
    toast.add({
      title: 'Create failed',
      description: err?.data?.statusMessage,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-bold">
        New custom role
      </h1>
      <UButton
        variant="outline"
        :to="`/@${orgSlug}/settings/roles`"
        icon="i-lucide-arrow-left"
      >
        Cancel
      </UButton>
    </header>

    <form
      class="space-y-4"
      @submit.prevent="submit"
    >
      <UFormField label="Name">
        <UInput
          v-model="name"
          autofocus
          :disabled="saving"
        />
      </UFormField>
      <UFormField label="Description">
        <UInput
          v-model="description"
          :disabled="saving"
        />
      </UFormField>

      <div class="space-y-2">
        <h2 class="font-semibold">
          Permissions
        </h2>
        <ul class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md max-h-96 overflow-y-auto">
          <li
            v-for="p in allPerms"
            :key="p.perm"
            class="flex items-center gap-3 p-3 cursor-pointer hover:bg-(--ui-bg-elevated)"
            @click="toggle(p.perm)"
          >
            <UCheckbox
              :model-value="selected.has(p.perm)"
              @update:model-value="toggle(p.perm)"
              @click.stop
            />
            <div class="min-w-0">
              <div class="font-mono text-sm">
                {{ p.perm }}
              </div>
              <div
                v-if="p.title || p.description"
                class="text-xs text-(--ui-text-muted)"
              >
                {{ p.title }}<span v-if="p.description"> — {{ p.description }}</span>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <div class="flex justify-end">
        <UButton
          type="submit"
          :loading="saving"
          :disabled="name.trim().length < 2 || selected.size === 0"
        >
          Create role
        </UButton>
      </div>
    </form>
  </div>
</template>
