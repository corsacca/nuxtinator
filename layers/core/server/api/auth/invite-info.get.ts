import { getQuery } from 'h3'
import { db } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Token is required' })
  }

  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'display_name', 'token_expires_at', 'password', 'verified'])
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

  // Show the inviter what orgs they're being added to. memberships are
  // joined off the user id (not the token); they were already created at
  // invite time.
  const orgs = await db
    .selectFrom('memberships')
    .innerJoin('orgs', 'orgs.id', 'memberships.org_id')
    .select(['orgs.slug as slug', 'orgs.name as name'])
    .where('memberships.user_id', '=', user.id)
    .execute()

  return {
    email: user.email,
    display_name: user.display_name,
    orgs
  }
})
