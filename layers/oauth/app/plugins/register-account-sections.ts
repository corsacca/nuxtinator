// Surface the OAuth "Connected apps" card on the user's account page.
// Core's account page reads `getAccountSections()` from
// `#core/app/utils/account-section-registry`; we register at app-plugin
// time so the registry is populated before the page renders.

import { registerAccountSection } from '#core/app/utils/account-section-registry'
import OauthConnectedApps from '../components/OauthConnectedApps.vue'

export default defineNuxtPlugin(() => {
  registerAccountSection({
    id: 'oauth-connected-apps',
    component: OauthConnectedApps,
    order: 50
  })
})
