// Per-org inbox settings, backed by core's shared settings store
// (core_settings + the code-owned registry). The defs are registered in
// register-inbox.ts with runtimeConfig-derived defaults; the DB holds only
// explicit per-org overrides, and RLS scopes reads to the caller's org
// through the transaction.
import { getSetting } from '#core/server/utils/settings-store'
import type { DbClient } from '#core/server/utils/settings'

export const INBOX_SETTINGS_NAMESPACE = 'inbox'
export const INBOX_SETTING_INBOUND_DOMAIN = 'inbound_domain'
export const INBOX_SETTING_CONTACT_ADDRESS = 'contact_address'
export const INBOX_SETTING_AUTO_ACK = 'auto_ack_enabled'
export const INBOX_SETTING_CONTACT_FORM_API_KEY = 'contact_form_api_key'

export interface InboxSettings {
  // Domain inbound mail is addressed to; matches recipient domains in the
  // webhook's org routing. One distinct (sub)domain per org.
  inboundDomain: string
  // Shared From identity and the base of contact+<token> reply addresses.
  contactAddress: string
  // Whether brand-new authenticated conversations get an automatic
  // acknowledgment email.
  autoAckEnabled: boolean
  // Server-to-server key that gates the public contact-form endpoint and
  // identifies which org a submission belongs to. Empty = the form is disabled.
  contactFormApiKey: string
}

export async function getInboxSettings(tx: DbClient): Promise<InboxSettings> {
  const [inboundDomain, contactAddress, autoAckEnabled, contactFormApiKey] = await Promise.all([
    getSetting<string>(tx, INBOX_SETTINGS_NAMESPACE, INBOX_SETTING_INBOUND_DOMAIN),
    getSetting<string>(tx, INBOX_SETTINGS_NAMESPACE, INBOX_SETTING_CONTACT_ADDRESS),
    getSetting<boolean>(tx, INBOX_SETTINGS_NAMESPACE, INBOX_SETTING_AUTO_ACK),
    getSetting<string>(tx, INBOX_SETTINGS_NAMESPACE, INBOX_SETTING_CONTACT_FORM_API_KEY)
  ])
  return {
    inboundDomain: String(inboundDomain || '').toLowerCase(),
    contactAddress: String(contactAddress || '').toLowerCase(),
    autoAckEnabled: autoAckEnabled !== false,
    contactFormApiKey: String(contactFormApiKey || '')
  }
}
