<script setup lang="ts">
definePageMeta({
  layout: 'auth'
})

const router = useRouter()
const route = useRoute()

const token = computed(() => route.query.token as string)

const state = reactive({
  password: '',
  confirmPassword: '',
  loading: false
})

const error = ref('')
const success = ref(false)
const invalidToken = ref(false)

// Validate token on mount
onMounted(() => {
  if (!token.value) {
    invalidToken.value = true
  }
})

async function handleResetPassword() {
  error.value = ''

  // Validate passwords
  if (state.password.length < 6) {
    error.value = 'Password must be at least 6 characters'
    return
  }

  if (state.password !== state.confirmPassword) {
    error.value = 'Passwords do not match'
    return
  }

  state.loading = true

  try {
    const response = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: {
        token: token.value,
        password: state.password,
        confirmPassword: state.confirmPassword
      }
    })

    success.value = true

    // Redirect to login after 2 seconds
    setTimeout(() => {
      router.push('/login')
    }, 2000)
  } catch (err: any) {
    error.value = err.data?.message || 'An error occurred. Please try again.'
  } finally {
    state.loading = false
  }
}
</script>

<template>
  <div>
    <!-- Logo/Header -->
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-(--ui-text) mb-2">
        Reset Password
      </h1>
      <p class="text-(--ui-text-muted)">
        Enter your new password
      </p>
    </div>

    <!-- Invalid Token View -->
    <UCard
      v-if="invalidToken"
      :ui="{ body: 'p-6 sm:p-8' }"
    >
      <div class="space-y-4">
        <UAlert
          color="error"
          variant="soft"
          title="Invalid Reset Link"
        />
        <p class="text-(--ui-text-muted)">
          This password reset link is invalid or has expired. Please request a new password reset.
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
    </UCard>

    <!-- Success View -->
    <UCard
      v-else-if="success"
      :ui="{ body: 'p-6 sm:p-8' }"
    >
      <div class="space-y-4">
        <UAlert
          color="success"
          variant="soft"
          title="Password Reset Successfully!"
        />
        <p class="text-(--ui-text-muted)">
          Your password has been reset. You can now log in with your new password.
        </p>
        <p class="text-sm text-(--ui-text-dimmed)">
          Redirecting to login page...
        </p>
      </div>
    </UCard>

    <!-- Reset Form -->
    <UCard
      v-else
      :ui="{ body: 'p-6 sm:p-8' }"
    >
      <form
        class="space-y-6"
        @submit.prevent="handleResetPassword"
      >
        <!-- Error Alert -->
        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :title="error"
          :close-button="{ icon: 'i-lucide-x', color: 'gray', variant: 'ghost' }"
          @close="error = ''"
        />

        <!-- Password Input -->
        <div class="space-y-2">
          <UFormField
            label="New Password"
            name="password"
            required
          >
            <UInput
              v-model="state.password"
              type="password"
              placeholder="Enter new password (min. 6 characters)"
              size="lg"
              :disabled="state.loading"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Confirm Password Input -->
        <div class="space-y-2">
          <UFormField
            label="Confirm Password"
            name="confirmPassword"
            required
          >
            <UInput
              v-model="state.confirmPassword"
              type="password"
              placeholder="Confirm new password"
              size="lg"
              :disabled="state.loading"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Submit Button -->
        <UButton
          type="submit"
          color="primary"
          size="lg"
          block
          :loading="state.loading"
          :disabled="state.loading || !state.password || !state.confirmPassword"
        >
          Reset Password
        </UButton>

        <!-- Back to Login -->
        <div class="text-center">
          <button
            type="button"
            class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
            :disabled="state.loading"
            @click="router.push('/login')"
          >
            ← Back to Login
          </button>
        </div>
      </form>
    </UCard>

    <!-- Footer -->
    <p class="text-center text-sm text-(--ui-text-dimmed) mt-8">
      By resetting your password, you agree to our Terms of Service and Privacy Policy
    </p>
  </div>
</template>
