<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin']
})

type UserStatus = 'active' | 'not_verified' | 'pending_invite' | 'expired_invite'

interface AdminUserRow {
  id: string
  display_name: string
  email: string
  verified: boolean
  is_admin: boolean
  status: UserStatus
  created: string
  last_login: string | null
  orgs: { slug: string, name: string }[]
}

const STATUS_META: Record<UserStatus, { label: string, color: 'success' | 'warning' | 'info' | 'error', icon: string }> = {
  active: { label: 'Active', color: 'success', icon: 'i-lucide-badge-check' },
  not_verified: { label: 'Not verified', color: 'warning', icon: 'i-lucide-mail-warning' },
  pending_invite: { label: 'Pending invite', color: 'info', icon: 'i-lucide-mail' },
  expired_invite: { label: 'Expired invite', color: 'error', icon: 'i-lucide-mail-x' }
}

interface UsersResponse {
  rows: AdminUserRow[]
  total: number
  page: number
  pageSize: number
}

const UIcon = resolveComponent('UIcon')
const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')

const toast = useToast()
const { user: currentUser } = useAuth()

const page = ref(1)
const pageSize = ref(50)
const search = ref('')
const sortField = ref<'display_name' | 'email' | 'status' | 'created' | 'last_login'>('created')
const sortDir = ref<'asc' | 'desc'>('desc')

const searchDebounced = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchDebounced.value = val
    page.value = 1
  }, 250)
})

const queryKey = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  q: searchDebounced.value,
  sort: sortField.value,
  dir: sortDir.value
}))

const { data, pending, error, refresh } = await useFetch<UsersResponse>('/api/admin/users', {
  query: queryKey,
  watch: [queryKey],
  default: () => ({ rows: [], total: 0, page: 1, pageSize: 50 })
})

interface AdminOrg {
  id: string
  slug: string
  name: string
}
const { data: orgsData } = await useFetch<{ orgs: AdminOrg[] }>(
  '/api/admin/orgs',
  { default: () => ({ orgs: [] }) }
)
const allOrgs = computed(() => orgsData.value?.orgs ?? [])

interface AttachmentDraft {
  orgId: string
  roles: string
}
const inviteOpen = ref(false)
const inviteEmail = ref('')
const inviteDisplayName = ref('')
const inviteAttachments = ref<AttachmentDraft[]>([])
const inviting = ref(false)
const inviteError = ref('')

const openInvite = () => {
  inviteEmail.value = ''
  inviteDisplayName.value = ''
  inviteAttachments.value = []
  inviteError.value = ''
  inviteOpen.value = true
}

const toggleAttachment = (orgId: string) => {
  const idx = inviteAttachments.value.findIndex(a => a.orgId === orgId)
  if (idx >= 0) {
    inviteAttachments.value = inviteAttachments.value.filter(a => a.orgId !== orgId)
  } else {
    inviteAttachments.value = [...inviteAttachments.value, { orgId, roles: 'member' }]
  }
}
const isAttached = (orgId: string) => inviteAttachments.value.some(a => a.orgId === orgId)
const setRolesFor = (orgId: string, val: string) => {
  inviteAttachments.value = inviteAttachments.value.map(a =>
    a.orgId === orgId ? { ...a, roles: val } : a
  )
}
const rolesFor = (orgId: string) =>
  inviteAttachments.value.find(a => a.orgId === orgId)?.roles ?? ''

const canSubmitInvite = computed(() =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.value.trim())
  && inviteAttachments.value.length > 0
  && inviteAttachments.value.every(a => a.roles.split(',').map(s => s.trim()).filter(Boolean).length > 0)
)

const submitInvite = async () => {
  inviteError.value = ''
  inviting.value = true
  try {
    await $fetch('/api/admin/users/invite', {
      method: 'POST',
      body: {
        email: inviteEmail.value.trim().toLowerCase(),
        display_name: inviteDisplayName.value.trim() || undefined,
        attachments: inviteAttachments.value.map(a => ({
          orgId: a.orgId,
          roles: a.roles.split(',').map(s => s.trim()).filter(Boolean)
        }))
      }
    })
    inviteOpen.value = false
    toast.add({ title: 'Invitation sent', color: 'success' })
    await refresh()
  } catch (err: unknown) {
    inviteError.value = (err as { data?: { statusMessage?: string }, message?: string } | null)?.data?.statusMessage
      || (err as { message?: string } | null)?.message
      || 'Failed to invite'
  } finally {
    inviting.value = false
  }
}

const toggleSort = (field: typeof sortField.value) => {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
  page.value = 1
}

const sortIcon = (field: typeof sortField.value) => {
  if (sortField.value !== field) return 'i-lucide-chevrons-up-down'
  return sortDir.value === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'
}

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

const sortableHeader = (label: string, field: typeof sortField.value) => () =>
  h(UButton, {
    variant: 'ghost',
    color: 'neutral',
    size: 'xs',
    class: '-mx-2',
    trailingIcon: sortIcon(field),
    onClick: (e: MouseEvent) => {
      e.stopPropagation()
      toggleSort(field)
    }
  }, () => label)

const columns: TableColumn<AdminUserRow>[] = [
  {
    accessorKey: 'display_name',
    header: sortableHeader('Name', 'display_name'),
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h('span', {}, row.original.display_name || '—'),
      row.original.is_admin
        ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'Host admin')
        : null
    ])
  },
  {
    accessorKey: 'email',
    header: sortableHeader('Email', 'email')
  },
  {
    accessorKey: 'status',
    header: sortableHeader('Status', 'status'),
    cell: ({ row }) => {
      const meta = STATUS_META[row.original.status] ?? STATUS_META.active
      return h(UBadge, { color: meta.color, variant: 'subtle', size: 'sm' }, () => [
        h(UIcon, { name: meta.icon, class: 'size-3 mr-1' }),
        meta.label
      ])
    }
  },
  {
    accessorKey: 'orgs',
    header: 'Organizations',
    cell: ({ row }) => {
      const orgs = row.original.orgs
      if (orgs.length === 0) {
        return h('span', { class: 'text-(--ui-text-muted) text-sm' }, '—')
      }
      return h('div', { class: 'flex flex-wrap gap-1' }, orgs.map(o =>
        h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => o.name)
      ))
    }
  },
  {
    accessorKey: 'created',
    header: sortableHeader('Created', 'created'),
    cell: ({ row }) => formatDate(row.original.created)
  },
  {
    accessorKey: 'last_login',
    header: sortableHeader('Last login', 'last_login'),
    cell: ({ row }) => formatDate(row.original.last_login)
  }
]

const total = computed(() => data.value?.total ?? 0)
const rows = computed(() => data.value?.rows ?? [])

// Edit slideover state
const selectedUser = ref<AdminUserRow | null>(null)
const editName = ref('')
const saving = ref(false)

const slideoverOpen = computed({
  get: () => selectedUser.value !== null,
  set: (val: boolean) => {
    if (!val) selectedUser.value = null
  }
})

const trimmedName = computed(() => editName.value.trim())
const nameValid = computed(() => trimmedName.value.length >= 2)
const nameChanged = computed(() =>
  selectedUser.value !== null && trimmedName.value !== selectedUser.value.display_name
)
const canSave = computed(() => nameValid.value && nameChanged.value && !saving.value)

const openRow = (row: AdminUserRow) => {
  selectedUser.value = row
  editName.value = row.display_name
}

const handleRowSelect = (_event: Event, row: { original: AdminUserRow }) => {
  openRow(row.original)
}

const tableMeta = computed(() => ({
  class: {
    tr: (row: { original: AdminUserRow }) =>
      selectedUser.value?.id === row.original.id ? 'bg-(--ui-bg-accented)' : ''
  }
}))

const handleSave = async () => {
  if (!selectedUser.value || !canSave.value) return
  saving.value = true
  try {
    const response = await $fetch<{ user: AdminUserRow }>(`/api/admin/users/${selectedUser.value.id}`, {
      method: 'PATCH',
      body: { display_name: trimmedName.value }
    })

    if (data.value) {
      data.value = {
        ...data.value,
        rows: data.value.rows.map(r => r.id === response.user.id ? response.user : r)
      }
    }

    toast.add({ title: 'User updated', color: 'success' })
    selectedUser.value = null
  } catch (err: unknown) {
    toast.add({
      title: 'Update failed',
      description: (err as { data?: { statusMessage?: string }, message?: string } | null)?.data?.statusMessage || (err as { message?: string } | null)?.message || 'Failed to update user',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const markingVerified = ref(false)
const sendingVerification = ref(false)
const resendingInvite = ref(false)

const handleMarkVerified = async () => {
  if (!selectedUser.value || selectedUser.value.verified) return
  markingVerified.value = true
  try {
    const userId = selectedUser.value.id
    await $fetch(`/api/admin/users/${userId}/verify`, { method: 'POST' })

    if (data.value) {
      data.value = {
        ...data.value,
        rows: data.value.rows.map(r =>
          r.id === userId ? { ...r, verified: true, status: 'active' as UserStatus } : r
        )
      }
    }
    if (selectedUser.value) {
      selectedUser.value = { ...selectedUser.value, verified: true, status: 'active' }
    }
    toast.add({ title: 'User marked as verified', color: 'success' })
  } catch (err: unknown) {
    toast.add({
      title: 'Verification failed',
      description: (err as { data?: { statusMessage?: string }, message?: string } | null)?.data?.statusMessage || (err as { message?: string } | null)?.message || 'Failed to mark user as verified',
      color: 'error'
    })
  } finally {
    markingVerified.value = false
  }
}

const handleSendVerification = async () => {
  if (!selectedUser.value || selectedUser.value.verified) return
  sendingVerification.value = true
  try {
    const userId = selectedUser.value.id
    await $fetch(`/api/admin/users/${userId}/send-verification`, { method: 'POST' })
    toast.add({ title: 'Verification email sent', color: 'success' })
  } catch (err: unknown) {
    toast.add({
      title: 'Send failed',
      description: (err as { data?: { statusMessage?: string }, message?: string } | null)?.data?.statusMessage || (err as { message?: string } | null)?.message || 'Failed to send verification email',
      color: 'error'
    })
  } finally {
    sendingVerification.value = false
  }
}

const handleResendInvite = async () => {
  if (!selectedUser.value) return
  resendingInvite.value = true
  try {
    const userId = selectedUser.value.id
    await $fetch(`/api/admin/users/${userId}/resend-invite`, { method: 'POST' })
    toast.add({ title: 'Invite resent', color: 'success' })

    if (selectedUser.value.status === 'expired_invite') {
      const updated = { ...selectedUser.value, status: 'pending_invite' as UserStatus }
      selectedUser.value = updated
      if (data.value) {
        data.value = {
          ...data.value,
          rows: data.value.rows.map(r => r.id === updated.id ? updated : r)
        }
      }
    }
  } catch (err: unknown) {
    toast.add({
      title: 'Resend failed',
      description: (err as { data?: { statusMessage?: string }, message?: string } | null)?.data?.statusMessage || (err as { message?: string } | null)?.message || 'Failed to resend invite',
      color: 'error'
    })
  } finally {
    resendingInvite.value = false
  }
}

const deleteModalOpen = ref(false)
const deleting = ref(false)

const isSelf = computed(() =>
  !!(selectedUser.value && currentUser.value && selectedUser.value.id === currentUser.value.id)
)

const handleDelete = async () => {
  if (!selectedUser.value || isSelf.value) return
  deleting.value = true
  try {
    const userId = selectedUser.value.id
    await $fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    toast.add({ title: 'User deleted', color: 'success' })
    deleteModalOpen.value = false
    selectedUser.value = null
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Delete failed',
      description: (err as { data?: { statusMessage?: string }, message?: string } | null)?.data?.statusMessage || (err as { message?: string } | null)?.message || 'Failed to delete user',
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">
          Users
        </h1>
        <p class="text-sm text-(--ui-text-muted)">
          Global user accounts. Org membership is managed under each org's settings.
        </p>
      </div>
      <UButton
        icon="i-lucide-user-plus"
        @click="openInvite"
      >
        Invite user
      </UButton>
    </header>

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search by name or email"
      size="md"
    />

    <UAlert
      v-if="error"
      color="error"
      :title="(error as any)?.statusMessage || 'Failed to load users'"
    />

    <UTable
      :columns="columns"
      :data="rows"
      :loading="pending"
      :ui="{ tr: 'cursor-pointer' }"
      :meta="tableMeta"
      @select="handleRowSelect"
    />

    <div class="flex items-center justify-between">
      <span class="text-sm text-(--ui-text-muted)">
        {{ total }} user{{ total === 1 ? '' : 's' }}
      </span>
      <UPagination
        v-model:page="page"
        :items-per-page="pageSize"
        :total="total"
      />
    </div>

    <USlideover
      v-model:open="slideoverOpen"
      side="right"
      :ui="{ content: 'max-w-md' }"
    >
      <template #content>
        <div
          v-if="selectedUser"
          class="p-6 space-y-6"
        >
          <header>
            <h2 class="text-xl font-semibold">
              {{ selectedUser.display_name }}
            </h2>
            <p class="text-sm text-(--ui-text-muted)">
              {{ selectedUser.email }}
            </p>
          </header>

          <UFormField label="Display name">
            <UInput
              v-model="editName"
              :disabled="saving"
            />
          </UFormField>

          <div class="flex gap-2">
            <UButton
              :loading="saving"
              :disabled="!canSave"
              @click="handleSave"
            >
              Save
            </UButton>
            <UButton
              variant="ghost"
              @click="selectedUser = null"
            >
              Cancel
            </UButton>
          </div>

          <hr class="border-(--ui-border)">

          <section class="space-y-2">
            <h3 class="font-medium">
              Verification
            </h3>
            <div class="flex gap-2 flex-wrap">
              <UButton
                v-if="!selectedUser.verified"
                :loading="markingVerified"
                @click="handleMarkVerified"
              >
                Mark verified
              </UButton>
              <UButton
                v-if="!selectedUser.verified"
                variant="outline"
                :loading="sendingVerification"
                @click="handleSendVerification"
              >
                Resend verification email
              </UButton>
              <UButton
                v-if="selectedUser.status === 'pending_invite' || selectedUser.status === 'expired_invite'"
                variant="outline"
                :loading="resendingInvite"
                @click="handleResendInvite"
              >
                Resend invite
              </UButton>
              <span
                v-if="selectedUser.verified"
                class="text-sm text-(--ui-text-muted)"
              >
                Verified.
              </span>
            </div>
          </section>

          <hr class="border-(--ui-border)">

          <section class="space-y-2">
            <h3 class="font-medium text-red-600">
              Danger zone
            </h3>
            <UButton
              color="error"
              variant="outline"
              :disabled="isSelf"
              @click="deleteModalOpen = true"
            >
              Delete user
            </UButton>
            <p
              v-if="isSelf"
              class="text-xs text-(--ui-text-muted)"
            >
              You cannot delete your own account here.
            </p>
          </section>
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="inviteOpen">
      <template #content>
        <form
          class="p-6 space-y-4"
          @submit.prevent="submitInvite"
        >
          <h2 class="text-lg font-semibold">
            Invite a user
          </h2>
          <p class="text-sm text-(--ui-text-muted)">
            New users get one email; existing users are silently attached to the
            chosen organizations. Host admin can grant any role.
          </p>

          <UFormField label="Email">
            <UInput
              v-model="inviteEmail"
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
              v-model="inviteDisplayName"
              :disabled="inviting"
            />
          </UFormField>

          <div class="space-y-2">
            <h3 class="font-medium">
              Attach to organizations
            </h3>
            <div
              v-if="allOrgs.length === 0"
              class="text-sm text-(--ui-text-muted)"
            >
              No organizations yet. Create one before inviting users.
            </div>
            <ul
              v-else
              class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md max-h-60 overflow-y-auto"
            >
              <li
                v-for="org in allOrgs"
                :key="org.id"
                class="p-3 flex items-start gap-3"
              >
                <UCheckbox
                  :model-value="isAttached(org.id)"
                  :disabled="inviting"
                  @update:model-value="toggleAttachment(org.id)"
                />
                <div class="min-w-0 flex-1">
                  <div class="font-medium">
                    {{ org.name }}
                  </div>
                  <div class="text-xs text-(--ui-text-muted)">
                    /@{{ org.slug }}
                  </div>
                  <UInput
                    v-if="isAttached(org.id)"
                    :model-value="rolesFor(org.id)"
                    placeholder="Roles (comma-separated)"
                    size="sm"
                    class="mt-2"
                    :disabled="inviting"
                    @update:model-value="(v: string | number) => setRolesFor(org.id, String(v))"
                  />
                </div>
              </li>
            </ul>
          </div>

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
              :disabled="!canSubmitInvite"
            >
              Send invite
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="deleteModalOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <h2 class="text-lg font-semibold">
            Delete user?
          </h2>
          <p class="text-sm">
            This is permanent. The user will lose access to every organization
            they belong to.
          </p>
          <div class="flex gap-2 justify-end">
            <UButton
              variant="ghost"
              @click="deleteModalOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              :loading="deleting"
              @click="handleDelete"
            >
              Delete
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
