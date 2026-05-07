import crypto from 'crypto'
import { db } from '../../utils/database'
import { logPasswordResetRequest } from '../../utils/activity-logger'
import { sendTemplateEmail } from '#email'
import { checkRateLimit, logRateLimitExceeded } from '../../utils/rate-limit'
import { readBody, getHeader } from 'h3'
import { useRuntimeConfig, createError } from '#imports'

export default defineEventHandler(async (event) => {
  const { email } = await readBody(event)

  // Basic validation
  if (!email || typeof email !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Email is required' })
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email format' })
  }

  // Always return success to prevent user enumeration
  const successResponse = {
    success: true,
    message: 'If an account with that email exists, password reset instructions have been sent.'
  }

  // Check rate limit by email
  const userAgent = getHeader(event, 'user-agent') || undefined
  const rateCheck = await checkRateLimit('PASSWORD_RESET_REQUEST', 'email', email, 15 * 60 * 1000, 3)

  if (!rateCheck.allowed) {
    logRateLimitExceeded(email, '/api/auth/forgot-password', userAgent)
    // Still return success to prevent enumeration
    return successResponse
  }

  // Log this password reset request
  logPasswordResetRequest(email, userAgent)

  try {
    // Check if user exists
    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'display_name'])
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst()

    // If user doesn't exist, still return success (security measure)
    if (!user) {
      return successResponse
    }

    // Generate reset token
    const token = crypto.randomUUID()
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

    await db.transaction().execute(async (trx) => {
      // Delete any existing unused or expired reset requests for this user
      await trx
        .deleteFrom('password_reset_requests')
        .where('user_id', '=', user.id)
        .execute()

      // Create reset request
      await trx
        .insertInto('password_reset_requests')
        .values({
          user_id: user.id,
          token,
          expires,
          used: false
        })
        .execute()
    })

    // Get base URL from runtime config or construct from headers
    const config = useRuntimeConfig()
    const host = getHeader(event, 'host')
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const baseUrl = config.public.baseUrl || `${protocol}://${host}`

    // Construct reset URL
    const resetUrl = `${baseUrl}/reset-password?token=${token}`

    // Send email
    const emailSent = await sendTemplateEmail({
      to: user.email,
      template: 'passwordReset',
      data: {
        userName: user.display_name || 'User',
        resetUrl
      }
    })

    // If email failed to send, delete the reset request
    if (!emailSent) {
      await db
        .deleteFrom('password_reset_requests')
        .where('token', '=', token)
        .execute()
      console.error('Failed to send password reset email to:', user.email)
      // Still return success to user to prevent enumeration
    }

    return successResponse
  } catch (error) {
    console.error('Error in forgot-password endpoint:', error)
    // Always return success to prevent enumeration
    return successResponse
  }
})
