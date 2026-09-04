<script setup lang="ts">
// Connect a mailbox with an app password. The server verifies the login and
// folder visibility before anything is stored, so errors here are Google's.
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ connected: [] }>()

const { connect } = useGmailAccounts()
const email = ref('')
const password = ref('')
const displayName = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

watch(open, (v) => {
  if (v) {
    email.value = ''
    password.value = ''
    displayName.value = ''
    error.value = null
  }
})

async function submit() {
  if (!email.value || !password.value) return
  busy.value = true
  error.value = null
  try {
    await connect({ email: email.value, password: password.value, displayName: displayName.value || null })
    open.value = false
    emit('connected')
  } catch (err) {
    error.value = gmailErrorMessage(err) ?? 'Could not connect'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Connect a Gmail account"
  >
    <template #body>
      <div class="space-y-4">
        <ol class="text-sm text-(--ui-text-muted) list-decimal pl-5 space-y-1">
          <li>Turn on 2-Step Verification for the Google account.</li>
          <li>
            Open
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noopener noreferrer"
              class="underline"
            >Google app passwords</a>
            and create one (any name).
          </li>
          <li>Paste the 16-character password below. It is stored encrypted.</li>
        </ol>
        <UFormField
          label="Gmail address"
          required
        >
          <UInput
            v-model="email"
            type="email"
            placeholder="you@gmail.com"
            class="w-full"
            autocomplete="off"
          />
        </UFormField>
        <UFormField
          label="App password"
          required
        >
          <UInput
            v-model="password"
            type="password"
            placeholder="xxxx xxxx xxxx xxxx"
            class="w-full"
            autocomplete="new-password"
          />
        </UFormField>
        <UFormField
          label="Display name"
          hint="Used as the From name"
        >
          <UInput
            v-model="displayName"
            placeholder="Your name"
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :title="error"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Cancel"
          variant="ghost"
          color="neutral"
          @click="open = false"
        />
        <UButton
          label="Connect"
          icon="i-lucide-plug"
          :loading="busy"
          :disabled="!email || !password"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
