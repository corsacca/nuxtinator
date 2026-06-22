<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

// Hard-redirect away from /dashboard. Users land in either:
//   * (single-tenant) home, since there are no orgs; or
//   * the most recently active org (sticky cookie set by withOrgContext); or
//   * /orgs (picker) when there's no last-active.
onMounted(async () => {
  if (!useRuntimeConfig().public.tenancy) {
    await navigateTo('/')
    return
  }
  const cookie = useCookie<string | null>('active-org-slug')
  if (cookie.value) {
    await navigateTo(`/@${cookie.value}/`)
  } else {
    await navigateTo('/orgs')
  }
})
</script>

<template>
  <div class="text-sm text-(--ui-text-muted)">
    Redirecting…
  </div>
</template>
