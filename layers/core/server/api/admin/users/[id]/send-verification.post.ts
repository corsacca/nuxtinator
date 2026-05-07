import { randomUUID } from 'crypto'
import { getRouterParam, getHeader, getRequestURL } from 'h3'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'
import { logEvent } from '../../../../utils/activity-logger'
import { sendTemplateEmail } from '#email'

export default defineEventHandler(async (event) => {
  const admin = await requireOperatorAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User id is required' })
  }

  const target = await db
    .selectFrom('users')
    .select(['id', 'email', 'display_name', 'verified', 'password'])
    .where('id', '=', id)
    .executeTakeFirst()

  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  if (target.verified) {
    throw createError({ statusCode: 400, statusMessage: 'User is already verified' })
  }

  // Pending invites haven't set a password yet — they need /resend-invite, not
  // verification. Otherwise the verification link they'd click would land them
  // in the wrong flow.
  if (target.password === null) {
    throw createError({
      statusCode: 409,
      statusMessage: 'User has not accepted their invite. Use POST /api/admin/users/[id]/resend-invite instead.'
    })
  }

  const tokenKey = randomUUID()
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db
    .updateTable('users')
    .set({
      token_key: tokenKey,
      token_expires_at: expires.toISOString(),
      updated: new Date().toISOString()
    })
    .where('id', '=', id)
    .execute()

  const baseUrl = getRequestURL(event).origin
  const verificationUrl = `${baseUrl}/api/auth/verify?token=${tokenKey}`

  const sent = await sendTemplateEmail({
    to: target.email,
    template: 'verification',
    data: {
      userName: target.display_name,
      verificationUrl
    }
  })

  if (!sent) {
    throw createError({ statusCode: 502, statusMessage: 'Failed to send verification email' })
  }

  await logEvent({
    eventType: 'admin_send_verification',
    tableName: 'users',
    recordId: id,
    userId: admin.userId,
    userAgent: getHeader(event, 'user-agent') || undefined,
    metadata: { email: target.email }
  })

  return { success: true }
})
