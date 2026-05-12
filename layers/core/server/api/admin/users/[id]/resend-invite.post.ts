import { randomUUID } from 'crypto'
import { getRouterParam, getHeader } from 'h3'
import { db } from '#core/server/utils/database'
import { requireOperatorAdmin } from '#tenant/server'
import { requireAuth } from '../../../../utils/auth'
import { logEvent } from '../../../../utils/activity-logger'
import { getSiteUrl } from '../../../../utils/site-url'
import { sendTemplateEmail } from '#email'

export default defineEventHandler(async (event) => {
  await requireOperatorAdmin(event)
  const admin = requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User id is required' })
  }

  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'display_name', 'password', 'verified'])
    .where('id', '=', id)
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
      statusMessage: 'User has already set a password. Use POST /api/admin/users/[id]/send-verification instead.'
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

  const inviteUrl = `${getSiteUrl()}/accept-invite?token=${tokenKey}`

  try {
    await sendTemplateEmail({
      to: user.email,
      template: 'invite',
      data: {
        userName: user.display_name,
        inviterName: admin.display_name,
        inviteUrl
      }
    })
  } catch (err) {
    console.error('Error sending invite email:', err)
  }

  await logEvent({
    eventType: 'invite_resent',
    tableName: 'users',
    recordId: id,
    userId: admin.userId,
    userAgent: getHeader(event, 'user-agent') || undefined,
    metadata: { email: user.email }
  })

  return { success: true }
})
