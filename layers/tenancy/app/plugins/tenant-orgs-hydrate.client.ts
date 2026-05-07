// Hydrates the user's org list into useState so `useMaybeActiveOrg()` can
// resolve `id` and `role` from a slug without a per-component fetch.
//
// Loads once at app boot. The org switcher refreshes this when the user
// joins/leaves orgs.
export default defineNuxtPlugin(async () => {
  const orgs = useState<Record<string, { id: string, role: string }>>('tenant:orgs', () => ({}))

  try {
    const list = await $fetch<Array<{ id: string, slug: string, role: string }>>('/api/orgs')
    const map: Record<string, { id: string, role: string }> = {}
    for (const o of list) map[o.slug] = { id: o.id, role: o.role }
    orgs.value = map
  } catch {
    // Unauthenticated or other failure — leave empty; pages that need it
    // will handle the empty case (typically by redirecting to login).
  }
})
