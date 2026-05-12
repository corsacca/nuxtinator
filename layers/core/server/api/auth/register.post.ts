import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { db, sql } from '../../utils/database'
import { logRegisterAttempt, logEvent } from '../../utils/activity-logger'
import { sendTemplateEmail } from '#email'
import { checkRateLimit, logRateLimitExceeded } from '../../utils/rate-limit'
import { readBody, getHeader, setResponseHeader, setCookie } from 'h3'
import { getSiteUrl } from '../../utils/site-url'
import { useRuntimeConfig, createError } from '#imports'

// Advisory-lock key used to serialize concurrent registrations so the
// first-user count check and insert can't interleave (ASCII 'reg1').
const REGISTRATION_LOCK_KEY = 1919248689

export default defineEventHandler(async (event) => {
  const { email, password, display_name } = await readBody(event)

  if (!email || !password || !display_name) {
    throw createError({ statusCode: 400, statusMessage: 'Email, password, and display name are required' })
  }

  if (display_name.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Display name must be at least 2 characters long' })
  }

  // Check rate limit by IP
  const clientIp = getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const userAgent = getHeader(event, 'user-agent') || undefined
  const rateCheck = await checkRateLimit('REGISTER_ATTEMPT', 'ip', clientIp, 15 * 60 * 1000, 10)

  if (!rateCheck.allowed) {
    logRateLimitExceeded(clientIp, '/api/auth/register', userAgent)
    setResponseHeader(event, 'Retry-After', rateCheck.retryAfterSeconds!)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many registration attempts. Please try again later.'
    })
  }

  // Log this registration attempt
  logRegisterAttempt(clientIp, userAgent)

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12)

  // Generate unique ID and token key
  const userId = randomUUID()
  const tokenKey = randomUUID()
  const now = new Date().toISOString()
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // First-user check + insert run atomically inside a transaction, with a
  // session-level advisory lock to serialize concurrent registrations. The
  // activity-log insert also rides on this transaction so the "who got the
  // admin role" audit row commits with the user row.
  const { isFirstUser } = await db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(${sql.lit(REGISTRATION_LOCK_KEY)})`.execute(trx)

    // Check if user already exists
    const existingUser = await trx
      .selectFrom('users')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst()

    if (existingUser) {
      throw createError({ statusCode: 409, statusMessage: 'User with this email already exists' })
    }

    const countRow = await trx
      .selectFrom('users')
      .select(eb => eb.fn.count<string>('id').as('count'))
      .executeTakeFirst()

    const firstUser = Number(countRow?.count ?? 0) === 0

    // First user is auto-promoted to host admin (single-bit, not a role).
    // Org-level admin assignment happens later when an org is created — host
    // admin is orthogonal to org membership.
    await trx
      .insertInto('users')
      .values({
        id: userId,
        created: now,
        updated: now,
        email,
        password: hashedPassword,
        verified: firstUser,
        is_admin: firstUser,
        display_name,
        avatar: '',
        token_key: tokenKey,
        token_expires_at: firstUser ? null : tokenExpiresAt
      })
      .execute()

    if (firstUser) {
      await logEvent({
        eventType: 'first_user_promoted',
        userId,
        userAgent,
        metadata: { email }
      }, trx)
    }

    return { isFirstUser: firstUser }
  })

  // First user gets auto-logged-in — no verification email, JWT cookie set directly.
  if (isFirstUser) {
    const token = jwt.sign(
      { userId, email, display_name },
      useRuntimeConfig().jwtSecret,
      { expiresIn: '120d' }
    )

    setCookie(event, 'auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 120
    })

    return {
      success: true,
      autoLoggedIn: true,
      requiresVerification: false,
      // First user has no orgs yet — land them on the picker, where they
      // can create the first org via the host-admin endpoint.
      redirect: '/orgs',
      user: {
        id: userId,
        email,
        display_name,
        avatar: '',
        verified: true,
        is_admin: true,
        permissions: []
      }
    }
  }

  // Normal registration: send verification email. Any failure is logged and
  // swallowed — the account is already committed, so turning an email failure
  // into a 500 would trap the user with an account they can't re-register.
  const verificationUrl = `${getSiteUrl()}/api/auth/verify?token=${tokenKey}`

  try {
    const emailSent = await sendTemplateEmail({
      to: email,
      template: 'verification',
      data: {
        userName: display_name,
        verificationUrl
      }
    })

    if (!emailSent) {
      console.error('Failed to send verification email to:', email)
    }
  } catch (err) {
    console.error('Error sending verification email:', err)
  }

  return {
    success: true,
    autoLoggedIn: false,
    requiresVerification: true,
    message: 'Registration successful! Please check your email to verify your account.'
  }
})
