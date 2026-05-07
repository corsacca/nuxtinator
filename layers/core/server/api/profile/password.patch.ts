import bcrypt from 'bcrypt'
import { sql } from 'kysely'

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = requireAuth(event)

  // Get request body
  const body = await readBody(event)
  const { current_password, new_password } = body

  // Validate input
  if (!current_password || typeof current_password !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Current password is required'
    })
  }

  if (!new_password || typeof new_password !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password is required'
    })
  }

  if (new_password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password must be at least 8 characters long'
    })
  }

  if (new_password.length > 128) {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password is too long (max 128 characters)'
    })
  }

  // Don't allow same password
  if (current_password === new_password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password must be different from current password'
    })
  }

  // Get current user password hash
  const current = await db
    .selectFrom('users')
    .select('password')
    .where('id', '=', user.userId)
    .executeTakeFirst()

  if (!current) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  // Verify current password
  const isCurrentPasswordValid = current.password
    ? await bcrypt.compare(current_password, current.password)
    : false

  if (!isCurrentPasswordValid) {
    // Log failed password change attempt
    logEvent({
      eventType: 'PASSWORD_CHANGE_FAILED',
      tableName: 'users',
      recordId: user.userId,
      userId: user.userId,
      userAgent: getHeader(event, 'user-agent') || undefined,
      metadata: {
        reason: 'invalid_current_password'
      }
    })

    throw createError({
      statusCode: 401,
      statusMessage: 'Current password is incorrect'
    })
  }

  // Hash new password
  const saltRounds = 12
  const newPasswordHash = await bcrypt.hash(new_password, saltRounds)

  // Update password in database
  await db
    .updateTable('users')
    .set({ password: newPasswordHash, updated: sql`now()` })
    .where('id', '=', user.userId)
    .execute()

  // Log successful password change
  logEvent({
    eventType: 'PASSWORD_CHANGED',
    tableName: 'users',
    recordId: user.userId,
    userId: user.userId,
    userAgent: getHeader(event, 'user-agent') || undefined,
    metadata: {}
  })

  return {
    success: true,
    message: 'Password changed successfully'
  }
})
