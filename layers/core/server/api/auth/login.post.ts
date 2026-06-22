import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { db } from '../../utils/database'
import { logLoginFailed, logLogin } from '../../utils/activity-logger'
import { checkRateLimit, logRateLimitExceeded } from '../../utils/rate-limit'
import { readBody, getHeader, setResponseHeader, setCookie } from 'h3'
import { useRuntimeConfig, createError } from '#imports'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  }

  // Check rate limit before processing login
  const userAgent = getHeader(event, 'user-agent') || undefined
  const rateCheck = await checkRateLimit('LOGIN_FAILED', 'email', email, 15 * 60 * 1000, 5)

  if (!rateCheck.allowed) {
    logRateLimitExceeded(email, '/api/auth/login', userAgent)
    setResponseHeader(event, 'Retry-After', rateCheck.retryAfterSeconds!)
    throw createError({
      statusCode: 429,
      statusMessage: `Too many login attempts. Try again in ${Math.ceil(rateCheck.retryAfterSeconds! / 60)} minutes.`
    })
  }

  // Query existing user from database
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email)
    .executeTakeFirst()

  if (!user) {
    logLoginFailed(email, userAgent, { reason: 'user_not_found' })
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  // Pending invites have no password set. Treat as generic invalid credentials
  // so we don't leak whether the email is associated with a pending invite.
  if (user.password === null) {
    logLoginFailed(email, userAgent, { reason: 'pending_invite' })
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  // Check if user is verified
  if (!user.verified) {
    logLoginFailed(email, userAgent, { reason: 'not_verified' })
    throw createError({ statusCode: 401, statusMessage: 'Please verify your email address before logging in' })
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password)
  if (!isValidPassword) {
    logLoginFailed(email, userAgent, { reason: 'invalid_password' })
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  // Generate new JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email, display_name: user.display_name },
    useRuntimeConfig().jwtSecret,
    { expiresIn: '120d' }
  )

  // Set secure cookie
  setCookie(event, 'auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 120 // 120 days
  })

  // Log successful login
  logLogin(user.id, userAgent)

  // Pick a redirect target. In multi-tenant mode it follows the user's
  // memberships (exactly one → land in that org; else → the org picker). In
  // single-tenant mode there are no orgs, so land on home. The orgs/memberships
  // tables only exist when the tenancy layer is loaded, so the query is gated on
  // the tenancy flag. Login flow respects ?redirect=… on the client side; this
  // is the default.
  let redirect = '/'
  if (useRuntimeConfig(event).public.tenancy === true) {
    const memberships = await (db as any)
      .selectFrom('memberships')
      .innerJoin('orgs', 'orgs.id', 'memberships.org_id')
      .select(['orgs.slug as slug', 'orgs.suspended_at as suspended_at'])
      .where('memberships.user_id', '=', user.id)
      .execute() as Array<{ slug: string, suspended_at: Date | null }>

    const active = memberships.filter(m => !m.suspended_at)
    redirect = active.length === 1 ? `/@${active[0]!.slug}/` : '/orgs'
  }

  return {
    success: true,
    redirect,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      avatar: user.avatar,
      verified: user.verified,
      is_admin: user.is_admin ?? false,
      // Permissions are now per-org. The login response intentionally omits
      // them; clients fetch them from `/api/o/:slug` on org enter.
      permissions: []
    }
  }
})
