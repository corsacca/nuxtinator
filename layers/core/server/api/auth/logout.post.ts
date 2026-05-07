export default defineEventHandler(async (event) => {
  // Get user info before clearing cookie
  const user = getAuthUser(event)
  const userAgent = getHeader(event, 'user-agent') || undefined

  // Clear the auth cookie
  setCookie(event, 'auth-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0 // Expire immediately
  })

  // Log logout if user was authenticated
  if (user?.userId) {
    logLogout(user.userId, userAgent)
  }

  return { success: true }
})
