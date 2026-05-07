export default defineNuxtPlugin(async () => {
  const { restoreFromCache, checkAuth, setAuthReady } = useAuth()

  restoreFromCache()
  // auth-token is httpOnly so document.cookie can't see it — always verify with the server
  await checkAuth()

  setAuthReady(true)
})
