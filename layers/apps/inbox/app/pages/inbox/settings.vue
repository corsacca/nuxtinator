<script setup lang="ts">
// Per-org inbox configuration (org-admin only): inbound mail domain, shared
// contact address, auto-ack, the contact-form API key, and the AI grounding
// source URLs. Values are org-scoped overrides on top of code defaults —
// clearing a field falls back to the deployment default at read time.
definePageMeta({ middleware: 'auth' })

interface InboxAdminSettings {
  inboundDomain: string
  contactAddress: string
  autoAckEnabled: boolean
  contactFormApiKey: string
  groundingSourceUrls: string[]
}

const toast = useToast()
const form = ref<InboxAdminSettings | null>(null)
const forbidden = ref(false)
const saving = ref(false)
// Textarea-friendly view of the URL list (one per line).
const urlsText = ref('')

// Sending identities (admin manager): every inbox user with their alias,
// joined from the assignees list (names) and the identities list (aliases).
interface IdentityRow {
  userId: string
  displayName: string
  alias: string
  hasSignature: boolean
  saving: boolean
}
const identities = ref<IdentityRow[]>([])

async function loadIdentities() {
  const [assignees, ids] = await Promise.all([
    $fetch<{ users: Array<{ id: string, displayName: string }> }>('/api/inbox/assignees'),
    $fetch<{ identities: Array<{ userId: string, alias: string | null, hasSignature: boolean }> }>('/api/inbox/identities')
  ])
  const byId = new Map(ids.identities.map(i => [i.userId, i]))
  identities.value = assignees.users.map(u => ({
    userId: u.id,
    displayName: u.displayName,
    alias: byId.get(u.id)?.alias ?? '',
    hasSignature: byId.get(u.id)?.hasSignature ?? false,
    saving: false
  }))
}

async function saveAlias(row: IdentityRow) {
  row.saving = true
  try {
    const res = await $fetch<{ alias: string | null }>(`/api/inbox/identities/${row.userId}`, {
      method: 'PUT',
      body: { alias: row.alias.trim() || null }
    })
    row.alias = res.alias ?? ''
    toast.add({ title: `Alias saved for ${row.displayName}`, icon: 'i-lucide-save', color: 'success' })
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode
    toast.add({
      title: status === 400 ? 'That alias is invalid or already taken' : 'Could not save alias',
      color: 'error'
    })
  } finally {
    row.saving = false
  }
}

async function load() {
  try {
    const s = await $fetch<InboxAdminSettings>('/api/inbox/settings')
    form.value = s
    urlsText.value = s.groundingSourceUrls.join('\n')
    await loadIdentities()
  } catch (err) {
    if ((err as { statusCode?: number })?.statusCode === 403) {
      forbidden.value = true
    } else {
      toast.add({ title: 'Could not load inbox settings', color: 'error' })
    }
  }
}
await load()

async function save() {
  if (!form.value) return
  saving.value = true
  try {
    const updated = await $fetch<InboxAdminSettings>('/api/inbox/settings', {
      method: 'PUT',
      body: {
        inboundDomain: form.value.inboundDomain,
        contactAddress: form.value.contactAddress,
        autoAckEnabled: form.value.autoAckEnabled,
        contactFormApiKey: form.value.contactFormApiKey,
        groundingSourceUrls: urlsText.value.split('\n').map(s => s.trim()).filter(Boolean)
      }
    })
    form.value = updated
    urlsText.value = updated.groundingSourceUrls.join('\n')
    toast.add({ title: 'Inbox settings saved', icon: 'i-lucide-save', color: 'success' })
  } catch (err) {
    const e = err as { statusCode?: number, data?: { message?: string } }
    toast.add({
      title: 'Save failed',
      description: e.statusCode === 400 ? 'Check the domain and address formats.' : undefined,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

function generateApiKey() {
  if (!form.value) return
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  form.value.contactFormApiKey = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <header>
      <h1 class="text-2xl font-bold">
        Inbox settings
      </h1>
      <p class="text-sm text-(--ui-text-muted)">
        Mail routing, courtesy replies, and integrations for this organization's inbox.
      </p>
    </header>

    <UAlert
      v-if="forbidden"
      icon="i-lucide-lock"
      color="warning"
      variant="subtle"
      title="Admins only"
      description="Only an organization admin can view or edit inbox settings."
    />

    <template v-else-if="form">
      <div class="space-y-4">
        <UFormField
          label="Inbound mail domain"
          description="The (sub)domain inbound mail arrives on, e.g. mail.example.com. Routes webhook mail to this organization."
        >
          <UInput v-model="form.inboundDomain" placeholder="mail.example.com" class="w-full" />
        </UFormField>

        <UFormField
          label="Shared contact address"
          description="The From identity for team replies and the base of contact+token reply addresses. Must live on the inbound domain."
        >
          <UInput v-model="form.contactAddress" placeholder="contact@mail.example.com" class="w-full" />
        </UFormField>

        <UFormField
          label="Auto-acknowledge new conversations"
          description="Send a courtesy 'we received your message' to authenticated senders opening a new conversation."
        >
          <USwitch v-model="form.autoAckEnabled" />
        </UFormField>

        <UFormField
          label="Contact-form API key"
          description="Server-to-server key that authorizes the public contact-form endpoint and routes submissions to this organization. Empty disables the form."
        >
          <div class="flex gap-2">
            <UInput v-model="form.contactFormApiKey" class="flex-1 font-mono" />
            <UButton
              label="Generate"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="subtle"
              @click="generateApiKey"
            />
          </div>
        </UFormField>

        <UFormField
          label="AI grounding source URLs"
          description="One URL per line. Pages are snapshotted daily as reference material for AI reply drafting."
        >
          <UTextarea v-model="urlsText" :rows="4" placeholder="https://example.com/help" class="w-full font-mono" />
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton
          label="Save settings"
          icon="i-lucide-save"
          :loading="saving"
          @click="save"
        />
      </div>

      <section class="space-y-3 pt-4 border-t border-(--ui-border)">
        <div>
          <h2 class="text-lg font-semibold">
            Sending identities
          </h2>
          <p class="text-sm text-(--ui-text-muted)">
            Each teammate's alias routes mail to &lt;alias&gt;@ the inbound domain to them and
            enables a personal From address. Signatures are self-service (each user edits their own).
          </p>
        </div>
        <ul class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md">
          <li
            v-for="row in identities"
            :key="row.userId"
            class="flex items-center gap-3 p-3"
          >
            <div class="min-w-0 flex-1">
              <div class="font-medium truncate">
                {{ row.displayName }}
              </div>
              <UBadge
                v-if="row.hasSignature"
                label="Has signature"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
            <UInput
              v-model="row.alias"
              placeholder="alias"
              class="w-40 font-mono"
            />
            <UButton
              label="Save"
              size="xs"
              color="neutral"
              variant="subtle"
              :loading="row.saving"
              @click="saveAlias(row)"
            />
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
