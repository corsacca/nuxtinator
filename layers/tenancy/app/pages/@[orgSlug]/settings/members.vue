<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const orgSlug = computed(() => route.params.orgSlug as string)
const toast = useToast()

interface Member {
  membership_id: string
  user_id: string
  email: string
  display_name: string
  roles: string[]
  status: 'active' | 'not_verified' | 'pending_invite' | 'expired_invite'
  joined_at: string
}

const { data, pending, refresh } = await useFetch<{ members: Member[] }>(
  () => `/api/o/${orgSlug.value}/members`,
  { watch: [orgSlug], default: () => ({ members: [] }) }
)

const members = computed(() => data.value?.members ?? [])

const inviteOpen = ref(false)
const inviteForm = reactive({
  email: '',
  display_name: '',
  roles: ['member'] as string[]
})
const inviting = ref(false)
const inviteError = ref('')

const onInvite = async () => {
  inviteError.value = ''
  inviting.value = true
  try {
    await $fetch(`/api/o/${orgSlug.value}/invite`, {
      method: 'POST',
      body: {
        email: inviteForm.email.trim().toLowerCase(),
        display_name: inviteForm.display_name.trim(),
        roles: inviteForm.roles
      }
    })
    inviteOpen.value = false
    inviteForm.email = ''
    inviteForm.display_name = ''
    inviteForm.roles = ['member']
    toast.add({ title: 'Invitation sent', color: 'success' })
    await refresh()
  } catch (err: unknown) {
    inviteError.value = err?.data?.statusMessage || 'Failed to invite'
  } finally {
    inviting.value = false
  }
}

const onRemove = async (m: Member) => {
  if (!confirm(`Remove ${m.display_name || m.email} from this org?`)) return
  try {
    await $fetch(`/api/o/${orgSlug.value}/members/${m.user_id}`, { method: 'DELETE' })
    toast.add({ title: 'Member removed', color: 'success' })
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Remove failed',
      description: err?.data?.statusMessage || 'Failed to remove member',
      color: 'error'
    })
  }
}

const statusLabel = (s: Member['status']) => ({
  active: 'Active',
  not_verified: 'Unverified',
  pending_invite: 'Pending',
  expired_invite: 'Expired invite'
}[s])
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <OrgSettingsNav />
    <div class="space-y-4">
      <header class="flex items-center justify-between gap-4">
        <h1 class="text-3xl font-bold">
          Members
        </h1>
        <UButton
          icon="i-lucide-user-plus"
          @click="inviteOpen = true"
        >
          Invite member
        </UButton>
      </header>

      <div
        v-if="pending && members.length === 0"
        class="text-sm text-(--ui-text-muted)"
      >
        Loading...
      </div>

      <ul
        v-else
        class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md"
      >
        <li
          v-for="m in members"
          :key="m.membership_id"
          class="flex items-center justify-between gap-3 p-3"
        >
          <div class="min-w-0">
            <div class="font-medium truncate">
              {{ m.display_name }}
            </div>
            <div class="text-xs text-(--ui-text-muted) truncate">
              {{ m.email }} · {{ m.roles.join(', ') }} · {{ statusLabel(m.status) }}
            </div>
          </div>
          <UButton
            variant="ghost"
            color="error"
            icon="i-lucide-user-minus"
            size="sm"
            @click="onRemove(m)"
          />
        </li>
      </ul>

      <UModal v-model:open="inviteOpen">
        <template #content>
          <form
            class="p-6 space-y-4"
            @submit.prevent="onInvite"
          >
            <h2 class="text-lg font-semibold">
              Invite a member
            </h2>
            <UFormField label="Email">
              <UInput
                v-model="inviteForm.email"
                type="email"
                autofocus
                :disabled="inviting"
              />
            </UFormField>
            <UFormField
              label="Display name"
              hint="Used only when this email isn't already a user."
            >
              <UInput
                v-model="inviteForm.display_name"
                :disabled="inviting"
              />
            </UFormField>
            <UFormField
              label="Roles (comma-separated)"
              hint="Default: member"
            >
              <UInput
                :model-value="inviteForm.roles.join(',')"
                :disabled="inviting"
                @update:model-value="(v: string | number) =>
                  inviteForm.roles = String(v).split(',').map(s => s.trim()).filter(Boolean)"
              />
            </UFormField>
            <UAlert
              v-if="inviteError"
              color="error"
              :title="inviteError"
            />
            <div class="flex gap-2 justify-end">
              <UButton
                variant="ghost"
                :disabled="inviting"
                @click="inviteOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                :loading="inviting"
                :disabled="!inviteForm.email"
              >
                Send invite
              </UButton>
            </div>
          </form>
        </template>
      </UModal>
    </div>
  </div>
</template>
