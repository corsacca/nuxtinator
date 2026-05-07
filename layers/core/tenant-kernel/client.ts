// Single-mode `#tenant` kernel — client side.
//
// The tenancy layer (when present) overrides this file via a Nuxt alias. App
// layer code imports from `#tenant` and never knows which side it's on.
//
// Single-mode contract: there is no active org. `useActiveOrg().slug.value`
// is always `null`; `isInOrg.value` is always `false`. The shape is reactive
// (computed refs) so callers can `watch` it or pass it to `useFetch`'s
// `watch:` option without special-casing.

import type { ComputedRef } from 'vue'

export interface ActiveOrg {
  slug: ComputedRef<string | null>
  isInOrg: ComputedRef<boolean>
}

export function useActiveOrg(): ActiveOrg {
  const slug = computed<string | null>(() => null)
  const isInOrg = computed(() => false)
  return { slug, isInOrg }
}

// Same shape as `useActiveOrg` — exists so app code that explicitly opts-in
// to "this might run on a global route" reads naturally.
export const useMaybeActiveOrg = useActiveOrg

export function getActiveSlug(): string | null {
  return null
}

export const useTenantFetch = $fetch
