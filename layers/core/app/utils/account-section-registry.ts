// Client-side registry for sections injected into the account/profile page
// (`/account`). Mirrors the server-side admin-section / app / nav registries
// in spirit, but lives client-side because each entry is a Vue component
// (not serialisable JSON metadata).
//
// Each layer that wants to surface a card on the user's account page
// registers from a Nuxt app plugin (typically
// `app/plugins/register-account-sections.ts`):
//
//   import { registerAccountSection } from '#core/app/utils/account-section-registry'
//   import OauthConnectedApps from '../components/OauthConnectedApps.vue'
//
//   export default defineNuxtPlugin(() => {
//     registerAccountSection({
//       id: 'oauth-connected-apps',
//       component: OauthConnectedApps,
//       order: 50
//     })
//   })
//
// The account page reads the registry at render time and emits each entry
// in `order` (ascending), id-sorted as a tiebreaker.

import type { Component } from 'vue'

export interface AccountSection {
  id: string
  component: Component
  order?: number
}

const _sections: AccountSection[] = []

export function registerAccountSection(section: AccountSection): void {
  if (!section || typeof section.id !== 'string' || section.id.length === 0) return
  if (!section.component) return
  if (_sections.some(s => s.id === section.id)) return
  _sections.push(section)
}

export function getAccountSections(): AccountSection[] {
  return [..._sections].sort((a, b) => {
    const ao = a.order ?? 100
    const bo = b.order ?? 100
    if (ao !== bo) return ao - bo
    return a.id.localeCompare(b.id)
  })
}
