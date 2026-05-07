<script setup lang="ts">
const { user, authReady } = useAuth()
const config = useRuntimeConfig()

watch([authReady, user], ([r, u]) => {
  if (r && u) {
    const cookie = useCookie<string | null>('active-org-slug')
    navigateTo(cookie.value ? `/@${cookie.value}/` : '/orgs')
  }
}, { immediate: true })
</script>

<template>
  <div>
    <div class="text-center py-16 px-4">
      <h1 class="text-4xl font-bold text-(--ui-text) mb-4">
        {{ config.public.appName }}
      </h1>
      <p class="text-(--ui-text-muted) mb-8 max-w-lg mx-auto">
        Get started by signing in or creating an account.
      </p>
      <div
        v-if="authReady && !user"
        class="flex gap-3 justify-center"
      >
        <UButton
          to="/login"
          color="primary"
          size="lg"
        >
          Sign in
        </UButton>
        <UButton
          to="/register"
          color="neutral"
          variant="subtle"
          size="lg"
        >
          Create account
        </UButton>
      </div>
    </div>
  </div>
</template>
