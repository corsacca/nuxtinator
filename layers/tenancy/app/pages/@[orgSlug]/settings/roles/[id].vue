<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const orgSlug = computed(() => route.params.orgSlug as string)
const roleId = computed(() => route.params.id as string)
const toast = useToast()

interface PermissionItem {
  perm: string
  title: string
  description: string
}
interface CustomRole {
  id: string
  name: string
  description: string
  permissions: string[]
}

const { data: permsData } = await useFetch<{ permissions: PermissionItem[] }>(
  () => `/api/o/${orgSlug.value}/permissions`,
  { watch: [orgSlug], default: () => ({ permissions: [] }) }
)
const allPerms = computed(() => permsData.value?.permissions ?? [])

// The org-scoped roles endpoint returns the full list. Find the one we want.
const { data: rolesData } = await useFetch<{ roles: CustomRole[] }>(
  () => `/api/o/${orgSlug.value}/roles`,
  { watch: [orgSlug], default: () => ({ roles: [] }) }
)
const role = computed(() => rolesData.value?.roles.find(r => r.id === roleId.value) ?? null)

const name = ref('')
const description = ref('')
const selected = ref<Set<string>>(new Set())

watch(role, (r) => {
  if (r) {
    name.value = r.name
    description.value = r.description
    selected.value = new Set(r.permissions)
  }
}, { immediate: true })

const toggle = (p: string) => {
  const next = new Set(selected.value)
  if (next.has(p)) next.delete(p)
  else next.add(p)
  selected.value = next
}

const saving = ref(false)
const onSave = async () => {
  saving.value = true
  try {
    await $fetch(`/api/o/${orgSlug.value}/roles/${roleId.value}`, {
      method: 'PUT',
      body: {
        name: name.value.trim(),
        description: description.value.trim(),
        permissions: [...selected.value]
      }
    })
    toast.add({ title: 'Role saved', color: 'success' })
  } catch (err: unknown) {
    toast.add({
      title: 'Save failed',
      description: (err as { data?: { statusMessage?: string } })?.data?.statusMessage,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const onDelete = async () => {
  if (!role.value) return
  if (!confirm(`Delete role "${role.value.name}"?`)) return
  try {
    await $fetch(`/api/o/${orgSlug.value}/roles/${roleId.value}`, { method: 'DELETE' })
    toast.add({ title: 'Role deleted', color: 'success' })
    await navigateTo(`/@${orgSlug.value}/settings/roles`)
  } catch (err: unknown) {
    toast.add({
      title: 'Delete failed',
      description: (err as { data?: { statusMessage?: string } })?.data?.statusMessage,
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-bold">
        {{ role?.name || 'Role' }}
      </h1>
      <UButton
        variant="outline"
        :to="`/@${orgSlug}/settings/roles`"
        icon="i-lucide-arrow-left"
      >
        Back
      </UButton>
    </header>

    <div
      v-if="!role"
      class="text-sm text-(--ui-text-muted)"
    >
      Loading...
    </div>

    <form
      v-else
      class="space-y-4"
      @submit.prevent="onSave"
    >
      <UFormField label="Name">
        <UInput
          v-model="name"
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

      <div class="flex gap-2 justify-end">
        <UButton
          variant="ghost"
          color="error"
          icon="i-lucide-trash-2"
          @click="onDelete"
        >
          Delete role
        </UButton>
        <UButton
          type="submit"
          :loading="saving"
          :disabled="name.trim().length < 2"
        >
          Save
        </UButton>
      </div>
    </form>
  </div>
</template>
