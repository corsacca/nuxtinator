import { randomUUID } from 'node:crypto'
import { readBody, getHeader, getRequestURL } from 'h3'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'
import { requireAuth } from '../../../utils/auth'
import { validateRoleNames } from '../../../utils/rbac'
import { logEvent } from '../../../utils/activity-logger'
import { sendTemplateEmail } from '#email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Attachment {
  orgId: string
  roles: string[]
}

// Host-admin multi-org invite. Body shape:
//
//   { email, display_name?, attachments: [{ orgId, roles }, ...] }
//
// Logic:
//   * If the user exists → silent attach (no email). Insert one membership
//     row per attachment; skip duplicates (409 listing the conflicts).
//   * If not → create the user (password=null, verified=false), insert N
//     membership rows, send ONE invite email.
//
// No subset-delegation. Host admin has god-mode by definition; subset is a
// discipline for org-level admins (per Phase 4.2).
export default defineEventHandler(async (event) => {
  const { userId: hostAdminId } = await requireOperatorAdmin(event)
  const admin = requireAuth(event)

  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const display_name = typeof body?.display_name === 'string' ? body.display_name.trim() : ''
  const attachmentsRaw = Array.isArray(body?.attachments) ? body.attachments : null

  if (!EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid email is required' })
  }
  if (!attachmentsRaw || attachmentsRaw.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'attachments must include at least one org' })
  }

  const attachments: Attachment[] = []
  for (const a of attachmentsRaw) {
    if (typeof a?.orgId !== 'string' || !Array.isArray(a?.roles)) {
      throw createError({ statusCode: 400, statusMessage: 'each attachment requires { orgId, roles }' })
    }
    if (a.roles.some((r: unknown) => typeof r !== 'string')) {
      throw createError({ statusCode: 400, statusMessage: 'roles must be strings' })
    }
    attachments.push({ orgId: a.orgId, roles: Array.from(new Set(a.roles)) })
  }

  // Validate every attachment's org exists + roles are known in that org.
  for (const att of attachments) {
    const org = await db.selectFrom('orgs').select('id').where('id', '=', att.orgId).executeTakeFirst()
    if (!org) {
      throw createError({ statusCode: 400, statusMessage: `Org ${att.orgId} does not exist` })
    }
    const { valid, unknown } = await validateRoleNames(db, att.roles)
    if (!valid) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unknown role(s) for org ${att.orgId}: ${unknown.join(', ')}`
      })
    }
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const tokenExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Look up existing user by email.
  const existing = await db
    .selectFrom('users')
    .select(['id', 'email', 'display_name', 'verified'])
    .where('email', '=', email)
    .executeTakeFirst()

  let userId: string
  let isNewUser: boolean
  let inviteToken: string | null = null

  if (existing) {
    userId = existing.id
    isNewUser = false

    // 409 the entire request if the user is already a member of any of the
    // requested orgs — saves the operator from a partial-success state.
    const dupes = await db
      .selectFrom('memberships')
      .select('org_id')
      .where('user_id', '=', userId)
      .where('org_id', 'in', attachments.map(a => a.orgId))
      .execute()
    if (dupes.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: `User is already a member of: ${dupes.map(d => d.org_id).join(', ')}`
      })
    }
  } else {
    if (display_name.length < 2) {
      throw createError({ statusCode: 400, statusMessage: 'Display name must be at least 2 characters for new users' })
    }

    userId = randomUUID()
    inviteToken = randomUUID()
    isNewUser = true

    await db
      .insertInto('users')
      .values({
        id: userId,
        created: nowIso,
        updated: nowIso,
        email,
        display_name,
        avatar: '',
        password: null,
        verified: false,
        is_admin: false,
        token_key: inviteToken,
        token_expires_at: tokenExpiresAt
      })
      .execute()
  }

  // Insert N membership rows in a single transaction.
  const memberships = attachments.map(att => ({
    id: randomUUID(),
    user_id: userId,
    org_id: att.orgId,
    roles: att.roles,
    created_at: nowIso,
    updated_at: nowIso
  }))

  await db.transaction().execute(async (trx) => {
    if (memberships.length > 0) {
      await trx.insertInto('memberships').values(memberships).execute()
    }
  })

  const nitro = useNitroApp()
  if (isNewUser) {
    try {
      await nitro.hooks.callHook('user.created', { userId, email, viaInvite: true })
    } catch (err) {
      console.warn('[hook user.created] handler threw:', err)
    }
  }
  for (const m of memberships) {
    try {
      await nitro.hooks.callHook('membership.created', {
        membershipId: m.id,
        userId: m.user_id,
        orgId: m.org_id,
        roles: m.roles,
        createdByUserId: hostAdminId
      })
    } catch (err) {
      console.warn('[hook membership.created] handler threw:', err)
    }
  }

  // Send a single invite email iff this is a new user.
  if (isNewUser && inviteToken) {
    const baseUrl = getRequestURL(event).origin
    const inviteUrl = `${baseUrl}/accept-invite?token=${inviteToken}`
    try {
      await sendTemplateEmail({
        to: email,
        template: 'invite',
        data: {
          userName: display_name,
          inviterName: admin.display_name,
          inviteUrl
        }
      })
    } catch (err) {
      console.error('Error sending invite email:', err)
    }
  }

  logEvent({
    eventType: isNewUser ? 'invite_sent_multi' : 'invite_attached_multi',
    tableName: 'users',
    recordId: userId,
    userId: hostAdminId,
    userAgent: getHeader(event, 'user-agent') || undefined,
    metadata: { email, attachments: attachments.map(a => ({ orgId: a.orgId, roles: a.roles })) }
  }).catch(() => {})

  return {
    user: {
      id: userId,
      email,
      display_name: existing?.display_name ?? display_name,
      verified: !!existing?.verified,
      created: nowIso
    },
    attachments: attachments.map(a => ({
      orgId: a.orgId,
      status: existing ? 'attached' : 'pending'
    }))
  }
})
