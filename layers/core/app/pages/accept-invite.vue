<script setup lang="ts">
definePageMeta({
  layout: 'auth'
})

const router = useRouter()
const route = useRoute()
const { checkAuth } = useAuth()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

const state = reactive({
  display_name: '',
  password: '',
  confirmPassword: ''
})

const inviteEmail = ref('')
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const inviteState = ref<'loading' | 'valid' | 'invalid' | 'expired'>('loading')

onMounted(async () => {
  if (!token.value) {
    inviteState.value = 'invalid'
    return
  }
  loading.value = true
  try {
    const data = await $fetch<{ email: string, display_name: string }>(
      '/api/auth/invite-info',
      { query: { token: token.value } }
    )
    inviteEmail.value = data.email
    state.display_name = data.display_name
    inviteState.value = 'valid'
  } catch (err: any) {
    inviteState.value = err?.statusCode === 410 ? 'expired' : 'invalid'
  } finally {
    loading.value = false
  }
})

const passwordMatch = computed(() => {
  if (!state.confirmPassword) return true
  return state.password === state.confirmPassword
})

async function handleAccept() {
  error.value = ''

  if (state.display_name.trim().length < 2) {
    error.value = 'Display name must be at least 2 characters'
    return
  }
  if (state.password.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }
  // Mismatch is surfaced inline under the confirm field; submit button is also
  // disabled in that state. Bail without surfacing a duplicate top-level alert.
  if (state.password !== state.confirmPassword) {
    return
  }

  submitting.value = true
  try {
    await $fetch('/api/auth/accept-invite', {
      method: 'POST',
      body: {
        token: token.value,
        password: state.password,
        display_name: state.display_name.trim()
      }
    })
    await checkAuth()
    await navigateTo('/dashboard', { replace: true })
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.data?.message || 'Failed to accept invitation. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-(--ui-text) mb-2">
        Accept Invitation
      </h1>
      <p class="text-(--ui-text-muted)">
        Set your password to activate your account
      </p>
    </div>

    <UCard :ui="{ body: 'p-6 sm:p-8' }">
      <div
        v-if="inviteState === 'loading'"
        class="flex items-center justify-center py-8"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-6 animate-spin text-(--ui-text-muted)"
        />
      </div>

      <div
        v-else-if="inviteState === 'invalid'"
        class="space-y-4"
      >
        <UAlert
          color="error"
          variant="soft"
          title="Invalid Invitation"
        />
        <p class="text-(--ui-text-muted)">
          This invitation link is invalid. Please ask your administrator for a new invite.
        </p>
        <UButton
          color="primary"
          size="lg"
          block
          @click="router.push('/login')"
        >
          Back to Login
        </UButton>
      </div>

      <div
        v-else-if="inviteState === 'expired'"
        class="space-y-4"
      >
        <UAlert
          color="error"
          variant="soft"
          title="Invitation Expired"
        />
        <p class="text-(--ui-text-muted)">
          This invitation has expired. Please ask your administrator to send a new invite.
        </p>
        <UButton
          color="primary"
          size="lg"
          block
          @click="router.push('/login')"
        >
          Back to Login
        </UButton>
      </div>

      <form
        v-else
        class="space-y-6"
        @submit.prevent="handleAccept"
      >
        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :title="error"
          :close-button="{ icon: 'i-lucide-x', color: 'gray', variant: 'ghost' }"
          @close="error = ''"
        />

        <UFormField label="Email">
          <UInput
            :model-value="inviteEmail"
            type="email"
            size="lg"
            disabled
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Display Name"
          name="display_name"
          required
        >
          <UInput
            v-model="state.display_name"
            type="text"
            size="lg"
            :disabled="submitting"
            autocomplete="name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Password"
          name="password"
          required
        >
          <UInput
            v-model="state.password"
            type="password"
            placeholder="At least 8 characters"
            size="lg"
            :disabled="submitting"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Confirm Password"
          name="confirmPassword"
          required
        >
          <UInput
            v-model="state.confirmPassword"
            type="password"
            size="lg"
            :disabled="submitting"
            autocomplete="new-password"
            :color="!passwordMatch ? 'error' : undefined"
            class="w-full"
          />
          <p
            v-if="!passwordMatch"
            class="text-xs text-red-600 mt-1"
          >
            Passwords do not match
          </p>
        </UFormField>

        <UButton
          type="submit"
          color="primary"
          size="lg"
          block
          :loading="submitting"
          :disabled="submitting || !state.password || !state.confirmPassword || !passwordMatch"
        >
          Activate Account
        </UButton>
      </form>
    </UCard>
  </div>
</template>
