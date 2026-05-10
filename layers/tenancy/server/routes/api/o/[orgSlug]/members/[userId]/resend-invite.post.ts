import { randomUUID } from 'node:crypto'
import { getRouterParam, getHeader, getRequestURL } from 'h3'
import { withOrgPermission } from '#tenant/server'
import { adminDb } from '#tenant/admin-db'
import { logEvent } from '#core/server/utils/activity-logger'
import { sendTemplateEmail } from '#email'

// Refresh the invite token for a member who hasn't accepted yet, and re-send
// the invite email. Refuses if the user has already set a password (use a
// "send-verification" flow there) or is already verified.
//
// Permission: org.members.invite — same gate as the original invite. The
// `users` table is global identity, so writes go via adminDb.
export default defineEventHandler(async (event) => {
  return await withOrgPermission(event, 'org.members.invite', async (tx, ctx) => {
    const targetUserId = getRouterParam(event, 'userId')
    if (!targetUserId) {
      throw createError({ statusCode: 400, statusMessage: 'userId required' })
    }

    // Confirm membership in this org first — keeps the resend scoped.
    const membership = await tx
      .selectFrom('memberships')
      .select('id')
      .where('user_id', '=', targetUserId)
      .where('org_id', '=', ctx.orgId)
      .executeTakeFirst()
    if (!membership) {
      throw createError({ statusCode: 404, statusMessage: 'Membership not found' })
    }

    const user = await adminDb
      .selectFrom('users')
      .select(['id', 'email', 'display_name', 'password', 'verified'])
      .where('id', '=', targetUserId)
      .executeTakeFirst()
    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }
    if (user.verified) {
      throw createError({ statusCode: 409, statusMessage: 'User is already verified' })
    }
    if (user.password !== null) {
      throw createError({
        statusCode: 409,
        statusMessage: 'User has already set a password; cannot resend an invite'
      })
    }

    const tokenKey = randomUUID()
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await adminDb
      .updateTable('users')
      .set({
        token_key: tokenKey,
        token_expires_at: expires.toISOString(),
        updated: new Date().toISOString()
      })
      .where('id', '=', targetUserId)
      .execute()

    const baseUrl = getRequestURL(event).origin
    const inviteUrl = `${baseUrl}/accept-invite?token=${tokenKey}`

    try {
      await sendTemplateEmail({
        to: user.email,
        template: 'invite',
        data: {
          userName: user.display_name,
          inviterName: ctx.userId,
          inviteUrl
        }
      })
    } catch (err) {
      console.error('Error sending invite email:', err)
    }

    logEvent({
      eventType: 'org_invite_resent',
      tableName: 'memberships',
      recordId: membership.id,
      userId: ctx.userId,
      userAgent: getHeader(event, 'user-agent') || undefined,
      metadata: { orgId: ctx.orgId, targetUserId, email: user.email }
    }).catch(() => {})

    return { success: true }
  })
})
