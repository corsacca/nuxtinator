// Org-prefix-preserving link builder for gmail routes. Takes the full app
// path ('/gmail/…').
export function useGmailPath() {
  const route = useRoute()
  return (path: string): string => {
    const raw = route.params?.orgSlug
    const slug = typeof raw === 'string' && raw.length > 0
      ? raw
      : (Array.isArray(raw) && raw.length > 0 ? raw[0] : null)
    return slug ? `/@${slug}${path}` : path
  }
}

// The active org slug ('' outside an org) — fetch watchers key on it so an
// org switch (SPA navigation reusing the page component) refetches.
export function useGmailOrgKey() {
  const route = useRoute()
  return computed(() => {
    const raw = route.params?.orgSlug
    if (typeof raw === 'string' && raw.length > 0) return raw
    if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].length > 0) return raw[0]
    return ''
  })
}
