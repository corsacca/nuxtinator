// PUT /api/inbox/settings — write per-org inbox configuration overrides.
// Org-admin only. Partial body: only the keys present are written. Every
// write goes through core's setSetting, so values are coerced by each
// setting's registered parse and stored as org-scoped overrides — the
// code-owned defaults stay the fallback for anything never set.
import { z } from 'zod'
import { withOrgPermission } from '#tenant/server'
import { setSetting } from '#core/server/utils/settings-store'
import {
  INBOX_SETTINGS_NAMESPACE,
  INBOX_SETTING_INBOUND_DOMAIN,
  INBOX_SETTING_CONTACT_ADDRESS,
  INBOX_SETTING_AUTO_ACK,
  INBOX_SETTING_CONTACT_FORM_API_KEY,
  INBOX_SETTING_GROUNDING_SOURCE_URLS
} from '../../../../utils/inbox-settings'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

const Body = z.object({
  // Empty string = clear back to the code default's behavior at read time
  // (the parse lowercases; routing treats '' as unconfigured).
  inboundDomain: z.string().trim().max(255)
    .refine(v => v === '' || DOMAIN_RE.test(v), 'Must be a bare domain, e.g. mail.example.com')
    .optional(),
  contactAddress: z.string().trim().max(320)
    .refine(v => v === '' || z.string().email().safeParse(v).success, 'Must be an email address')
    .optional(),
  autoAckEnabled: z.boolean().optional(),
  contactFormApiKey: z.string().trim().max(255).optional(),
  groundingSourceUrls: z.array(z.string().max(2000)).max(20).optional()
}).strict()

export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, { appId: 'inbox' }, 'inbox.access', async (tx, ctx) => {
    if (!ctx.roles.includes('admin')) {
      throw createError({ statusCode: 403, statusMessage: 'Only an admin can edit inbox settings' })
    }
    const parsed = Body.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid settings', data: parsed.error.flatten() })
    }
    const b = parsed.data
    if (b.inboundDomain !== undefined) await setSetting(tx, INBOX_SETTINGS_NAMESPACE, INBOX_SETTING_INBOUND_DOMAIN, b.inboundDomain)
    if (b.contactAddress !== undefined) await setSetting(tx, INBOX_SETTINGS_NAMESPACE, INBOX_SETTING_CONTACT_ADDRESS, b.contactAddress)
    if (b.autoAckEnabled !== undefined) await setSetting(tx, INBOX_SETTINGS_NAMESPACE, INBOX_SETTING_AUTO_ACK, b.autoAckEnabled)
    if (b.contactFormApiKey !== undefined) await setSetting(tx, INBOX_SETTINGS_NAMESPACE, INBOX_SETTING_CONTACT_FORM_API_KEY, b.contactFormApiKey)
    if (b.groundingSourceUrls !== undefined) await setSetting(tx, INBOX_SETTINGS_NAMESPACE, INBOX_SETTING_GROUNDING_SOURCE_URLS, b.groundingSourceUrls)

    const s = await getInboxSettings(tx)
    return {
      inboundDomain: s.inboundDomain,
      contactAddress: s.contactAddress,
      autoAckEnabled: s.autoAckEnabled,
      contactFormApiKey: s.contactFormApiKey,
      groundingSourceUrls: s.groundingSourceUrls
    }
  })
})
