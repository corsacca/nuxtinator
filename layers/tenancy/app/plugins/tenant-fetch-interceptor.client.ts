// Global $fetch interceptor that injects `X-Active-Org` on relative `/api/*`
// requests when the user is currently inside an org context. App layer code
// can write `useFetch('/api/mail/threads')` and the right header lands in
// multi mode without any awareness of tenancy.
//
// Source of truth for the slug is the current page URL — `useRoute().params.orgSlug`,
// populated by the `pages:extend` `/@:orgSlug/<path>` aliasing. If the page
// is on a global route (no `:orgSlug`), no header is added.
import { getActiveSlug } from '#tenant'

export default defineNuxtPlugin(() => {
  const original = globalThis.$fetch
  if (!original) return

  // Wrap with a request interceptor. ofetch supports per-call options.onRequest;
  // we patch globally by overriding $fetch with a thin wrapper.
  const interceptor: typeof globalThis.$fetch = ((request: unknown, options?: Record<string, unknown>) => {
    const url = typeof request === 'string' ? request : ''
    if (url.startsWith('/api/')) {
      const slug = getActiveSlug()
      if (slug) {
        const headers = new Headers(options?.headers as HeadersInit | undefined)
        if (!headers.has('x-active-org')) headers.set('x-active-org', slug)
        return original(request as never, { ...(options ?? {}), headers } as never)
      }
    }
    return original(request as never, options as never)
  }) as typeof globalThis.$fetch

  // Carry through the .raw / .create static methods.
  Object.assign(interceptor, {
    raw: original.raw.bind(original),
    create: original.create.bind(original)
  })

  globalThis.$fetch = interceptor
})
