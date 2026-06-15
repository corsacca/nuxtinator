<script setup lang="ts">
/**
 * /feedback/connect — sign-in bridge for the embeddable widget.
 *
 * The widget (on a third-party site) full-page-redirects here with the project,
 * its redirect_uri, a `state`, and a PKCE `code_challenge`. This page runs on
 * the host origin, so the host session cookie is available:
 *   - POST /api/v1/feedback/authorize (same-origin). 401 → bounce through the
 *     host login and return here. 200 → redirect the one-time code back to the
 *     embedding site, where the widget exchanges it for a token.
 *
 * Public page — it handles its own auth bounce rather than relying on the auth
 * middleware (which wouldn't preserve these query params through login).
 */
// `tenantExempt` keeps the tenancy route guard from rewriting this naive path
// to `/@<org-slug>/...` or bouncing it to /orgs — this bridge owns no org
// context and handles its own login bounce.
definePageMeta({ layout: false, tenantExempt: true })

const route = useRoute()
const status = ref<'working' | 'error'>('working')
const message = ref('Connecting…')

function returnHere(): string {
  const qs = new URLSearchParams(route.query as Record<string, string>).toString()
  return `/feedback/connect?${qs}`
}

onMounted(async () => {
  const projectId = String(route.query.project_id || '')
  const redirectUri = String(route.query.redirect_uri || '')
  const state = String(route.query.state || '')
  const codeChallenge = String(route.query.code_challenge || '')

  if (!projectId || !redirectUri || !codeChallenge) {
    status.value = 'error'
    message.value = 'Missing sign-in parameters.'
    return
  }

  try {
    const { code } = await $fetch<{ code: string }>('/api/v1/feedback/authorize', {
      method: 'POST',
      body: { project_id: projectId, redirect_uri: redirectUri, code_challenge: codeChallenge }
    })
    const back = new URL(redirectUri)
    back.searchParams.set('code', code)
    if (state) back.searchParams.set('state', state)
    window.location.replace(back.toString())
  } catch (e: any) {
    const code = e?.statusCode ?? e?.status ?? e?.response?.status
    if (code === 401) {
      await navigateTo(`/login?redirect=${encodeURIComponent(returnHere())}`)
      return
    }
    status.value = 'error'
    message.value = e?.data?.statusMessage || 'Could not start sign-in for this site.'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6 text-center">
    <div class="space-y-2">
      <p v-if="status === 'working'" class="text-(--ui-text-muted)">
        {{ message }}
      </p>
      <template v-else>
        <p class="font-semibold text-(--ui-error)">
          Sign-in failed
        </p>
        <p class="text-sm text-(--ui-text-muted)">
          {{ message }}
        </p>
      </template>
    </div>
  </div>
</template>
