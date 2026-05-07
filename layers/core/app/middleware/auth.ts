export default defineNuxtRouteMiddleware(async (to, _from) => {
  const { user, checkAuth } = useAuth()

  if (!user.value) {
    const authUser = await checkAuth()

    if (!authUser) {
      const redirectUrl = to.fullPath
      return navigateTo(`/login?redirect=${encodeURIComponent(redirectUrl)}`)
    }
  }
})
