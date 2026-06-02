// Default `#email` impl when no email-* layer is loaded. Throws helpfully so
// the developer knows to add e.g. `layers/email-mailgun/` to `extends:`.
//
// Lives outside `server/utils/` and `app/utils/` so Nuxt's auto-imports don't
// double up on it. The `modules/email-kernel.ts` Nuxt module wires it as the
// `#email` alias only when no other layer has set the alias first.

import type { EmailTemplateData } from '../server/utils/email-templates'

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
}

export interface TemplateEmailOptions {
  to: string | string[]
  template: keyof typeof import('../server/utils/email-templates').emailTemplates
  data: EmailTemplateData
  from?: string
  subject?: string
}

function notConfigured(): never {
  throw new Error(
    'No email backend is configured. Add an email layer (e.g. `\'./layers/email-cloudflare\'`) '
    + 'to `extends:` in nuxt.config.ts.'
  )
}

export async function sendEmail(_options: EmailOptions): Promise<boolean> {
  notConfigured()
}

export async function sendTemplateEmail(_options: TemplateEmailOptions): Promise<boolean> {
  notConfigured()
}

export async function sendBulkTemplateEmails(_emails: TemplateEmailOptions[]): Promise<{ success: number, failed: number }> {
  notConfigured()
}
