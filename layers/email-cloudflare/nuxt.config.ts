// Cloudflare Email Sending backend. Provides the `#email` alias used by core/auth
// code to send transactional emails (verify, password reset, invite, etc).
//
// In dev mode the implementation falls back to MailHog at localhost:1025 so you
// can preview emails without leaving the laptop. Production sends via the
// Cloudflare Email Service REST API.
//
// Required env in production:
//   CLOUDFLARE_ACCOUNT_ID        (Cloudflare account id)
//   CLOUDFLARE_EMAIL_API_TOKEN   (API token with email sending permission)
//   SMTP_FROM                    (default sender address — must be on the onboarded domain)
//   SMTP_FROM_NAME               (default sender name)
//
// The sending domain must be on Cloudflare DNS and onboarded via the Email
// Sending dashboard (which auto-adds MX/SPF/DKIM/DMARC). Requires a paid Workers plan.
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    fileURLToPath(new URL('./modules/email-alias.ts', import.meta.url))
  ],

  // This layer owns its own config — the host no longer declares these.
  runtimeConfig: {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    cloudflareEmailApiToken: process.env.CLOUDFLARE_EMAIL_API_TOKEN || '',
    smtpFrom: process.env.SMTP_FROM || '',
    smtpFromName: process.env.SMTP_FROM_NAME || ''
  }
})
