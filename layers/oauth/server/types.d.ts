// Type augmentations for the OAuth layer. Extends Nitro's
// `NitroRuntimeHooks` map with hooks fired by the layer so that
// consumer code calling `nitroApp.hooks.hook('oauth:consent-granted', ...)`
// typechecks cleanly.

import type { H3Event } from 'h3'

// Payload for the `oauth:consent-granted` hook. Fired from
// authorize.post.ts after a user explicitly approves a consent
// request. The auto-issue short-circuit in authorize.get.ts (existing
// consent covers the requested scope) does NOT fire this hook —
// silent re-issues never trigger downstream notifications.
export interface OauthConsentGrantedPayload {
  userId: string
  clientId: string
  clientName: string
  dynamic: boolean
  scope: string
  resource: string
  event: H3Event
}

declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    'oauth:consent-granted': (payload: OauthConsentGrantedPayload) => void | Promise<void>
  }
}

// Older Nitro releases publish the hook map under `nitropack` instead
// of `nitropack/types`. Augmenting both keeps the layer compatible
// across Nitro versions consumers might pin to.
declare module 'nitropack' {
  interface NitroRuntimeHooks {
    'oauth:consent-granted': (payload: OauthConsentGrantedPayload) => void | Promise<void>
  }
}

export {}
