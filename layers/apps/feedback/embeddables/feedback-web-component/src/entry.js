/**
 * entry.js — <feedback-web-component> custom element registration.
 *
 * Single file that touches the browser's custom-elements API. Every
 * <feedback-web-component> instance gets its own Shadow DOM (via
 * defineCustomElement) AND its own Pinia instance (via configureApp) so that
 * multiple web components on one page never share reactive state.
 *
 * Slot positioning CSS is inlined into this bundle (see `slot.css?raw` import
 * below) and injected into <head> on load, so a host page only needs:
 *
 *   <script src="feedback-web-component.iife.js"></script>
 *   <div class="feedback-widget-slot">
 *     <feedback-web-component profile-config='{
 *       "profile": "chat-bubble",
 *       "instanceId": "fb-1",
 *       "projectId": "uuid-here",
 *       "apiBase": "https://kanban.example.com",
 *       "enabled": true
 *     }'></feedback-web-component>
 *   </div>
 */

import { defineCustomElement } from 'vue'
import { createPinia } from 'pinia'
import ProfileLoader from './ProfileLoader.vue'
import slotCss from '../slot.css?raw'

function injectSlotCss() {
  if (typeof document === 'undefined') return
  // Guard against duplicate injection if the bundle loads twice (e.g. SPA nav).
  if (document.getElementById('feedback-widget-slot-css')) return
  const style = document.createElement('style')
  style.id = 'feedback-widget-slot-css'
  style.textContent = slotCss
  // Prepend so host-page rules later in <head> or in <body> still win by cascade order.
  document.head.prepend(style)
}

// Consume `?feedback` at bundle load — runs before any framework
// hydration/router can replace the URL, so the opt-in is captured even on
// SSR + ClientOnly hosts where ProfileLoader's setup runs after the URL
// has already been "cleaned" by the host's router.
// Accepts ?feedback, ?feedback=true, ?feedback=1 — but not =false / =0.
function consumeUrlOptIn() {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('feedback')) {
      const v = params.get('feedback')
      if (v !== 'false' && v !== '0') {
        try { localStorage.setItem('show-feedback-widget', 'true') } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

injectSlotCss()
consumeUrlOptIn()

const FeedbackWebComponentElement = defineCustomElement(ProfileLoader, {
  configureApp(app) {
    // One Pinia per instance. Two <feedback-web-component> tags on the same page do
    // NOT share reactive state — except for localStorage-mirrored auth, which
    // is synced via the storage event (see useFeedback.js).
    app.use(createPinia())
  }
})

if (!customElements.get('feedback-web-component')) {
  customElements.define('feedback-web-component', FeedbackWebComponentElement)
}

export default FeedbackWebComponentElement
