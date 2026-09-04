<script setup lang="ts">
// Accounts & preferences: connect/disconnect mailboxes, edit the From name,
// signature and app password, trigger a sync, and set the undo-send window.
import type { GmailAccount } from '../../composables/useGmailAccounts'

definePageMeta({ middleware: 'auth' })
defineOptions({ name: 'GmailSettingsPage' })

const gmailPath = useGmailPath()
const toast = useToast()
const { accounts, pending, refresh, update, disconnect, syncNow } = useGmailAccounts()
const prefsStore = useGmailPrefs()

const showAdd = ref(false)
const editing = ref<GmailAccount | null>(null)
const editName = ref('')
const editSignature = ref('')
const editPassword = ref('')
const editBusy = ref(false)
const editError = ref<string | null>(null)
const syncing = ref<Set<string>>(new Set())

onMounted(() => {
  refresh()
  prefsStore.refresh()
})

function startEdit(a: GmailAccount) {
  editing.value = a
  editName.value = a.displayName ?? ''
  editSignature.value = a.signatureHtml ?? ''
  editPassword.value = ''
  editError.value = null
}

async function saveEdit() {
  if (!editing.value) return
  editBusy.value = true
  editError.value = null
  try {
    await update(editing.value.id, {
      displayName: editName.value || null,
      signatureHtml: editSignature.value || null,
      ...(editPassword.value ? { password: editPassword.value } : {})
    })
    editing.value = null
    toast.add({ title: 'Account updated', icon: 'i-lucide-check', color: 'success' })
  } catch (err) {
    editError.value = gmailErrorMessage(err) ?? 'Could not save'
  } finally {
    editBusy.value = false
  }
}

async function onDisconnect(a: GmailAccount) {
  if (!confirm(`Disconnect ${a.email}? Mirrored mail and drafts for this account are removed from here (Gmail itself is untouched).`)) return
  try {
    await disconnect(a.id)
    toast.add({ title: 'Account disconnected', icon: 'i-lucide-unplug', color: 'neutral' })
  } catch (err) {
    toast.add({ title: 'Could not disconnect', description: gmailErrorMessage(err), color: 'error' })
  }
}

async function onSync(a: GmailAccount) {
  syncing.value = new Set([...syncing.value, a.id])
  try {
    await syncNow(a.id)
    toast.add({ title: 'Synced', icon: 'i-lucide-refresh-cw', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Sync failed', description: gmailErrorMessage(err), color: 'error' })
  } finally {
    const next = new Set(syncing.value)
    next.delete(a.id)
    syncing.value = next
  }
}

const undoOptions = [0, 5, 10, 20, 30].map(s => ({ label: s === 0 ? 'Off' : `${s} seconds`, value: s }))
async function onUndoChange(v: number) {
  try {
    await prefsStore.save({ undoSendSeconds: v })
  } catch (err) {
    toast.add({ title: 'Could not save preference', description: gmailErrorMessage(err), color: 'error' })
  }
}

function statusBadge(a: GmailAccount): { label: string, color: 'success' | 'warning' | 'error' | 'neutral' } {
  if (a.status === 'error') return { label: 'Disconnected', color: 'error' }
  if (!a.backfillDone) return { label: 'Importing history', color: 'warning' }
  if (a.status === 'active') return { label: 'Connected', color: 'success' }
  return { label: 'Connecting', color: 'neutral' }
}
</script>

<template>
  <div class="max-w-3xl space-y-8">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">
          Gmail accounts
        </h1>
        <p class="text-sm text-(--ui-text-muted)">
          Each account connects with a Google app password and syncs over IMAP.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          label="Back to mail"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          :to="gmailPath('/gmail')"
        />
        <UButton
          label="Connect account"
          icon="i-lucide-plus"
          @click="showAdd = true"
        />
      </div>
    </div>

    <div
      v-if="pending && !accounts.length"
      class="text-sm text-(--ui-text-muted)"
    >
      Loading…
    </div>
    <UEmpty
      v-else-if="!accounts.length"
      icon="i-lucide-mail"
      title="No accounts yet"
      description="Connect a Gmail account to start."
      :actions="[{ label: 'Connect account', icon: 'i-lucide-plus', onClick: () => { showAdd = true } }]"
    />
    <div
      v-else
      class="space-y-3"
    >
      <UCard
        v-for="a in accounts"
        :key="a.id"
      >
        <div class="flex items-start gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium truncate">{{ a.email }}</span>
              <UBadge
                :label="statusBadge(a).label"
                :color="statusBadge(a).color"
                variant="subtle"
                size="sm"
              />
            </div>
            <p class="text-sm text-(--ui-text-muted)">
              {{ a.displayName || 'No display name' }}
              <span v-if="a.lastSyncAt"> · synced {{ gmailRelativeTime(a.lastSyncAt) }}</span>
            </p>
            <p
              v-if="a.lastError"
              class="mt-1 text-sm text-(--ui-error)"
            >
              {{ a.lastError }}
            </p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UButton
              icon="i-lucide-refresh-cw"
              label="Sync now"
              size="xs"
              color="neutral"
              variant="ghost"
              :loading="syncing.has(a.id)"
              @click="onSync(a)"
            />
            <UButton
              icon="i-lucide-pencil"
              label="Edit"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="startEdit(a)"
            />
            <UButton
              icon="i-lucide-unplug"
              label="Disconnect"
              size="xs"
              color="error"
              variant="ghost"
              @click="onDisconnect(a)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <h2 class="font-medium">
          Sending
        </h2>
      </template>
      <UFormField
        label="Undo send"
        hint="How long a message waits before it actually leaves"
      >
        <USelect
          :model-value="prefsStore.prefs.value?.undoSendSeconds ?? 10"
          :items="undoOptions"
          class="w-48"
          @update:model-value="v => onUndoChange(Number(v))"
        />
      </UFormField>
    </UCard>

    <GmailAddAccountModal v-model:open="showAdd" />

    <UModal
      :open="!!editing"
      :title="editing ? `Edit ${editing.email}` : ''"
      @update:open="v => { if (!v) editing = null }"
    >
      <template #body>
        <div class="space-y-3">
          <UFormField
            label="Display name"
            hint="Used as the From name"
          >
            <UInput
              v-model="editName"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Signature"
            hint="Appended to new messages and replies"
          >
            <UEditor
              v-model="editSignature"
              content-type="html"
              placeholder="Your signature"
              :image="false"
              :mention="false"
              class="min-h-24 max-h-48 overflow-y-auto rounded-md border border-(--ui-border)"
            />
          </UFormField>
          <UFormField
            label="New app password"
            hint="Leave blank to keep the current one"
          >
            <UInput
              v-model="editPassword"
              type="password"
              class="w-full"
              autocomplete="new-password"
            />
          </UFormField>
          <UAlert
            v-if="editError"
            color="error"
            variant="subtle"
            :title="editError"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            label="Cancel"
            variant="ghost"
            color="neutral"
            @click="editing = null"
          />
          <UButton
            label="Save"
            icon="i-lucide-save"
            :loading="editBusy"
            @click="saveEdit"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
