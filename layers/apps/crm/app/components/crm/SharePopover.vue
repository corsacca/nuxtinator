<script setup lang="ts">
// Record sharing popover: who the record is shared with (avatar + name), a
// remove button per share, and an async user picker to add more. A share
// grants visibility to users without <type>.view_all — see the server's
// record-visibility rule. The add/remove controls hide unless the caller
// holds the <type>.share permission — reported as `canShare` by the shares
// GET endpoint, since there is no client-side org-permission store; the
// server enforces it regardless, so the client gate is presentation only.
import type { CrmUser } from '../../composables/useCrmUsers'

const props = defineProps<{
  recordId: string
  typeKey: string
}>()

const emit = defineEmits<{
  changed: []
}>()

const toast = useToast()

const { shares, canShare, pending, error, refresh, addShare, removeShare } = useCrmShares(
  () => props.typeKey,
  () => props.recordId
)

const { users, ensureUsers, searchUsers } = useCrmUsers()

const open = ref(false)
const searchTerm = ref('')
const results = ref<CrmUser[]>([])
const searching = ref(false)

// Everything loads lazily on first open; reopening refetches so the list
// reflects shares granted elsewhere in the meantime.
watch(open, async (isOpen) => {
  if (!isOpen) return
  await refresh()
  if (!canShare.value) return
  searching.value = true
  try {
    await ensureUsers()
    results.value = users.value
  } catch {
    // An empty picker communicates the failure; adds validate server-side.
  } finally {
    searching.value = false
  }
})

let timer: ReturnType<typeof setTimeout> | null = null
watch(searchTerm, (q) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    searching.value = true
    try {
      results.value = await searchUsers(q)
    } catch {
      // Keep the previous results on a failed search.
    } finally {
      searching.value = false
    }
  }, 250)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

interface PickerItem {
  label: string
  value: string
  avatar?: { src?: string, alt: string }
}

// Already-shared users drop out of the picker — adding them again would be a
// server-side no-op anyway.
const sharedIds = computed(() => new Set(shares.value.map(s => s.userId)))
const items = computed<PickerItem[]>(() =>
  results.value
    .filter(u => !sharedIds.value.has(u.id))
    .map(u => ({ label: u.name, value: u.id, avatar: { src: u.avatarUrl || undefined, alt: u.name } }))
)

const adding = ref(false)
async function onPick(userId: string | null | undefined) {
  if (typeof userId !== 'string' || userId === '') return
  adding.value = true
  try {
    await addShare(userId)
    emit('changed')
  } catch (err) {
    toast.add({
      title: 'Share failed',
      description: crmErrorMessage(err, 'Failed to share record'),
      color: 'error'
    })
  } finally {
    adding.value = false
    searchTerm.value = ''
  }
}

const removingId = ref<string | null>(null)
async function onRemove(userId: string) {
  removingId.value = userId
  try {
    await removeShare(userId)
    emit('changed')
  } catch (err) {
    toast.add({
      title: 'Unshare failed',
      description: crmErrorMessage(err, 'Failed to remove share'),
      color: 'error'
    })
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      icon="i-lucide-share-2"
      color="neutral"
      variant="outline"
      size="sm"
      label="Share"
    />
    <template #content>
      <div class="w-72 p-3 space-y-3">
        <p class="text-xs font-medium uppercase tracking-wide text-(--ui-text-muted)">
          Shared with
        </p>

        <UAlert
          v-if="error"
          color="error"
          :title="error"
        />
        <div
          v-else-if="pending && shares.length === 0"
          class="flex justify-center py-3 text-(--ui-text-muted)"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-4 animate-spin"
          />
        </div>
        <p
          v-else-if="shares.length === 0"
          class="text-sm text-(--ui-text-muted)"
        >
          Not shared with anyone yet.
        </p>
        <ul
          v-else
          class="space-y-1"
        >
          <li
            v-for="share in shares"
            :key="share.userId"
            class="flex items-center gap-2"
          >
            <UAvatar
              :src="share.avatarUrl || undefined"
              :alt="share.name"
              size="2xs"
            />
            <span class="text-sm truncate flex-1">{{ share.name }}</span>
            <UButton
              v-if="canShare"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :loading="removingId === share.userId"
              :aria-label="`Remove ${share.name}`"
              @click="onRemove(share.userId)"
            />
          </li>
        </ul>

        <!-- model-value is pinned to '' (reka-ui's clear-selection sentinel,
             here a controlled empty): undefined would flip reka-ui to
             uncontrolled mode, where the picked id sticks as the selection
             and renders as a raw uuid once the user drops out of `items`.
             Picking is handled entirely by @update:model-value; onPick
             ignores the '' echo. -->
        <USelectMenu
          v-if="canShare"
          v-model:search-term="searchTerm"
          :model-value="''"
          :items="items"
          ignore-filter
          :loading="searching || adding"
          value-key="value"
          label-key="label"
          placeholder="Share with..."
          class="w-full"
          @update:model-value="onPick"
        />
      </div>
    </template>
  </UPopover>
</template>
