// Mailgun email backend. Provides the `#email` alias used by core/auth code
// to send transactional emails (verify, password reset, invite, etc).
//
// In dev mode the implementation falls back to MailHog at localhost:1025 so
// you can preview emails without leaving the laptop.
//
// Required env in production:
//   MAILGUN_API_KEY
//   MAILGUN_DOMAIN
//   MAILGUN_HOST       (optional — for EU region, set to api.eu.mailgun.net)
//   SMTP_FROM          (default sender address)
//   SMTP_FROM_NAME     (default sender name)
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    fileURLToPath(new URL('./modules/email-alias.ts', import.meta.url))
  ]
})
