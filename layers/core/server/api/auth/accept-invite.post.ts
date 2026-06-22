import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { readBody, getHeader, setCookie } from 'h3'
import { useRuntimeConfig } from '#imports'
import { db } from '../../utils/database'
import { logEvent, logLogin } from '../../utils/activity-logger'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const token = typeof body?.token === 'string' ? body.token : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const display_name = typeof body?.display_name === 'string' ? body.display_name.trim() : ''

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Token is required' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' })
  }

  if (display_name.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Display name must be at least 2 characters' })
  }

  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'verified', 'password', 'token_expires_at'])
    .where('token_key', '=', token)
    .executeTakeFirst()

  // An invite is "still pending" iff no password has been set yet. `verified`
  // is a separate, admin-controlled axis and must not gate acceptance.
  if (!user || user.password !== null) {
    throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  }

  const expires = user.token_expires_at ? new Date(user.token_expires_at) : null
  if (!expires || expires.getTime() <= Date.now()) {
    throw createError({ statusCode: 410, statusMessage: 'Invitation has expired' })
  }

  const hashedPassword = await bcrypt.hash(password, 12)
  const newTokenKey = randomUUID()

  // Idempotency / TOCTOU guard: only mutate while the row is still pending.
  // A second concurrent POST loses the race and gets a clean 410.
  const result = await db
    .updateTable('users')
    .set({
      password: hashedPassword,
      display_name,
      verified: true,
      token_key: newTokenKey,
      token_expires_at: null,
      updated: new Date().toISOString()
    })
    .where('id', '=', user.id)
    .where('password', 'is', null)
    .executeTakeFirst()

  if (Number(result.numUpdatedRows ?? 0) === 0) {
    throw createError({ statusCode: 410, statusMessage: 'Invitation has already been accepted' })
  }

  const jwtToken = jwt.sign(
    { userId: user.id, email: user.email, display_name },
    useRuntimeConfig().jwtSecret,
    { expiresIn: '120d' }
  )

  setCookie(event, 'auth-token', jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 120
  })

  const userAgent = getHeader(event, 'user-agent') || undefined

  await logEvent({
    eventType: 'invite_accepted',
    tableName: 'users',
    recordId: user.id,
    userId: user.id,
    userAgent,
    metadata: { email: user.email }
  })

  logLogin(user.id, userAgent, { via: 'invite_accept' })

  const nitro = useNitroApp()
  try {
    await nitro.hooks.callHook('user.verified' as any, { userId: user.id, email: user.email })
  } catch (err) {
    console.warn('[hook user.verified] handler threw:', err)
  }

  // Pick a redirect target so the client doesn't need a second round-trip. In
  // single-tenant mode there are no orgs (the orgs/memberships tables only exist
  // when the tenancy layer is loaded), so land on home.
  let redirect = '/'
  if (useRuntimeConfig(event).public.tenancy === true) {
    const memberships = await (db as any)
      .selectFrom('memberships')
      .innerJoin('orgs', 'orgs.id', 'memberships.org_id')
      .select(['orgs.slug as slug'])
      .where('memberships.user_id', '=', user.id)
      .execute() as Array<{ slug: string }>
    redirect = memberships.length === 1 ? `/@${memberships[0]!.slug}/` : '/orgs'
  }

  return { success: true, redirect }
})
