// Inbox layer — two-way shared email inbox built on the CRM layer's channel
// kernel. Conversations key on crm_channels (the address registry); inbound
// mail arrives via a signed Mailgun webhook, outbound replies ride a
// croner-swept queue on inbox_messages itself.
//
// The layer imports CRM kernel services from `#crm/server` (registered by the
// crm layer's own nuxt.config; aliases merge across extends:, so no alias is
// declared here). Mailgun sending credentials are shared with the
// email-mailgun layer (same env names — duplicate runtimeConfig declarations
// merge harmlessly); the webhook signing key and inbox addressing are
// inbox-specific.
export default defineNuxtConfig({
  runtimeConfig: {
    mailgunApiKey: process.env.MAILGUN_API_KEY || '',
    mailgunDomain: process.env.MAILGUN_DOMAIN || '',
    mailgunHost: process.env.MAILGUN_HOST || 'api.mailgun.net',
    // Webhook signing key — a DIFFERENT Mailgun key than the sending API key
    // (Settings → API Keys → "HTTP webhook signing key").
    mailgunWebhookSigningKey: process.env.MAILGUN_WEBHOOK_SIGNING_KEY || '',
    // Domain inbound mail is addressed to (MX → Mailgun catch-all route).
    // Per-org overrides live in inbox_settings; this is the code default.
    inboxDomain: process.env.INBOX_DOMAIN || '',
    // Shared/system From identity and the base of contact+<token> reply
    // addresses, e.g. "contact@example.com".
    inboxContactAddress: process.env.INBOX_CONTACT_ADDRESS || '',
    // Send-sweep cadence in seconds. Tests lower it to make queued sends
    // observable quickly.
    inboxSendSweepSeconds: process.env.INBOX_SEND_SWEEP_SECONDS || '20'
  }
})
