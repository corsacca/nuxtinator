import { randomUUID } from 'node:crypto'
import { getHeader } from 'h3'
import { withOrgPermission } from '#tenant/server'
import { validateRoleNames, getRolePermissions } from '#core/server/utils/rbac'
import { logEvent } from '#core/server/utils/activity-logger'
import { getSiteUrl } from '#core/server/utils/site-url'
import { sendTemplateEmail } from '#email'
import { adminDb } from '#tenant/admin-db'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Per-org admin invite (single org). Subset-delegation enforced against the
// inviter's effective perm set in *this* org.
//
// Existing user → silent attach (no email). New user → invite email + token.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.members.invite', async (tx, ctx) => {
    const body = await readBody(event)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const display_name = typeof body?.display_name === 'string' ? body.display_name.trim() : ''
    const inputRoles = Array.isArray(body?.roles) ? body.roles : null

    if (!EMAIL_RE.test(email)) {
      throw createError({ statusCode: 400, statusMessage: 'A valid email is required' })
    }
    if (!inputRoles || inputRoles.some((r: unknown) => typeof r !== 'string')) {
      throw createError({ statusCode: 400, statusMessage: 'roles must be an array of strings' })
    }
    const roles = Array.from(new Set(inputRoles as string[]))

    const { valid, unknown } = await validateRoleNames(tx, roles)
    if (!valid) {
      throw createError({ statusCode: 400, statusMessage: `Unknown role(s): ${unknown.join(', ')}` })
    }

    // Subset-delegation: roles being assigned can't grant a permission the
    // inviter doesn't hold in this org.
    const assigningPerms = await getRolePermissions(tx, roles, ctx.orgId)
    const missing = [...assigningPerms].filter(p => !ctx.perms.has(p))
    if (missing.length > 0) {
      throw createError({
        statusCode: 403,
        statusMessage: `Cannot assign roles granting permissions you don't hold: ${missing.join(', ')}`
      })
    }

    // User lookup hits the global users table — not RLS-scoped.
    const existing = await adminDb
      .selectFrom('users')
      .select(['id', 'email', 'display_name', 'verified'])
      .where('email', '=', email)
      .executeTakeFirst()

    const now = new Date()
    const nowIso = now.toISOString()
    const tokenExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

    let userId: string
    let isNewUser: boolean
    let inviteToken: string | null = null

    if (existing) {
      userId = existing.id
      isNewUser = false

      // The membership insert below runs with RLS active and the active org's
      // GUC set, so it'll only succeed against this org. A pre-check makes
      // the error message kinder.
      const dupe = await tx
        .selectFrom('memberships')
        .select('id')
        .where('user_id', '=', userId)
        .where('org_id', '=', ctx.orgId)
        .executeTakeFirst()
      if (dupe) {
        throw createError({ statusCode: 409, statusMessage: 'User is already a member of this org' })
      }
    } else {
      if (display_name.length < 2) {
        throw createError({ statusCode: 400, statusMessage: 'Display name must be at least 2 characters for new users' })
      }
      userId = randomUUID()
      inviteToken = randomUUID()
      isNewUser = true

      // The users table is not RLS-protected; insert via adminDb.
      await adminDb
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

    const membershipId = randomUUID()
    await tx
      .insertInto('memberships')
      .values({
        id: membershipId,
        user_id: userId,
        org_id: ctx.orgId,
        roles,
        created_at: nowIso,
        updated_at: nowIso
      })
      .execute()

    const nitro = useNitroApp()
    if (isNewUser) {
      try {
        await nitro.hooks.callHook('user.created', { userId, email, viaInvite: true })
      } catch (err) { console.warn('[hook user.created]', err) }
    }
    try {
      await nitro.hooks.callHook('membership.created', {
        membershipId,
        userId,
        orgId: ctx.orgId,
        roles,
        createdByUserId: ctx.userId
      })
    } catch (err) { console.warn('[hook membership.created]', err) }

    if (isNewUser && inviteToken) {
      const inviteUrl = `${getSiteUrl()}/accept-invite?token=${inviteToken}`
      const inviter = await adminDb
        .selectFrom('users')
        .select(['display_name', 'email'])
        .where('id', '=', ctx.userId)
        .executeTakeFirst()
      try {
        await sendTemplateEmail({
          to: email,
          template: 'invite',
          data: {
            userName: display_name,
            inviterName: inviter?.display_name || inviter?.email || 'Someone',
            orgName: ctx.orgName,
            inviteUrl
          }
        })
      } catch (err) {
        console.error('Error sending invite email:', err)
      }
    }

    logEvent({
      eventType: isNewUser ? 'org_invite_sent' : 'org_invite_attached',
      tableName: 'memberships',
      recordId: membershipId,
      userId: ctx.userId,
      userAgent: getHeader(event, 'user-agent') || undefined,
      metadata: { orgId: ctx.orgId, email, roles }
    }, tx).catch(() => {})

    return {
      user: { id: userId, email, display_name: existing?.display_name ?? display_name },
      membership: { id: membershipId, roles },
      status: isNewUser ? 'pending' : 'attached'
    }
  })
})
