import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { renderEmailTemplate, type EmailTemplateData } from '#core/server/utils/email-templates'

const isDevelopment = (process.env.NODE_ENV || 'development') === 'development'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

let transporter: Transporter | null = null

function getEmailConfig() {
  try {
    const config = useRuntimeConfig()
    return {
      cloudflareAccountId: config.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID,
      cloudflareEmailApiToken: config.cloudflareEmailApiToken || process.env.CLOUDFLARE_EMAIL_API_TOKEN,
      smtpFrom: config.smtpFrom || process.env.SMTP_FROM,
      smtpFromName: config.smtpFromName || process.env.SMTP_FROM_NAME,
      appName: config.appName || process.env.APP_NAME
    }
  } catch {
    return {
      cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      cloudflareEmailApiToken: process.env.CLOUDFLARE_EMAIL_API_TOKEN,
      smtpFrom: process.env.SMTP_FROM,
      smtpFromName: process.env.SMTP_FROM_NAME,
      appName: process.env.APP_NAME
    }
  }
}

// Dev-only transport: inject into MailHog/Mailpit over SMTP so emails are
// previewable (and asserted by tests) without leaving the laptop.
function getMailHogTransporter(): Transporter {
  if (transporter) return transporter

  console.log('[Email] Using MailHog (development mode)')
  transporter = nodemailer.createTransport({
    host: 'localhost',
    port: 1025,
    secure: false,
    tls: { rejectUnauthorized: false }
  })
  return transporter
}

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
}

export interface TemplateEmailOptions {
  to: string | string[]
  template: keyof typeof import('#core/server/utils/email-templates').emailTemplates
  data: EmailTemplateData
  from?: string
  subject?: string
}

async function sendViaMailHog(options: EmailOptions): Promise<boolean> {
  const config = getEmailConfig()

  let fromEmail = options.from
  if (!fromEmail) {
    const fromName = config.smtpFromName || config.appName
    fromEmail = fromName ? `${fromName} <noreply@localhost.local>` : 'noreply@localhost.local'
  }

  const info = await getMailHogTransporter().sendMail({
    from: fromEmail,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, '')
  })

  console.log('[Email] Sent successfully:', info.messageId)
  return true
}

async function sendViaCloudflare(options: EmailOptions): Promise<boolean> {
  const config = getEmailConfig()

  if (!config.cloudflareAccountId || !config.cloudflareEmailApiToken) {
    throw new Error('Cloudflare Email configuration incomplete. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EMAIL_API_TOKEN.')
  }

  let from: string | { address: string, name: string } | undefined = options.from
  if (!from) {
    const fromName = config.smtpFromName || config.appName
    const fromAddress = config.smtpFrom || 'noreply@yourdomain.com'
    from = fromName ? { address: fromAddress, name: fromName } : fromAddress
  }

  console.log('[Email] Using Cloudflare Email Sending')
  const res = await $fetch<{ success: boolean, errors?: unknown[] }>(
    `${CLOUDFLARE_API_BASE}/accounts/${config.cloudflareAccountId}/email/sending/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.cloudflareEmailApiToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, '')
      }
    }
  )

  if (res && res.success === false) {
    throw new Error(`Cloudflare Email API error: ${JSON.stringify(res.errors)}`)
  }

  console.log('[Email] Sent successfully via Cloudflare')
  return true
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    return isDevelopment ? await sendViaMailHog(options) : await sendViaCloudflare(options)
  } catch (error) {
    if (!process.env.VITEST) {
      console.error('[Email] Error sending:', error)
    }
    return false
  }
}

export async function sendTemplateEmail(options: TemplateEmailOptions): Promise<boolean> {
  try {
    const config = getEmailConfig()
    const appName = config.appName || 'App'

    const templateData = { ...options.data, appName }
    const { subject, html, text } = renderEmailTemplate(options.template, templateData)

    return await sendEmail({
      to: options.to,
      subject: options.subject || subject,
      html,
      text,
      from: options.from
    })
  } catch (error) {
    if (!process.env.VITEST) {
      console.error('[Email] Error sending template email:', error)
    }
    return false
  }
}

export async function sendBulkTemplateEmails(emails: TemplateEmailOptions[]): Promise<{ success: number, failed: number }> {
  let success = 0
  let failed = 0

  for (const email of emails) {
    const result = await sendTemplateEmail(email)
    if (result) success++
    else failed++
  }

  return { success, failed }
}
