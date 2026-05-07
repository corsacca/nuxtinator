export const useTheme = () => {
  const colorMode = useColorMode()

  const theme = computed(() => colorMode.value)

  const toggleTheme = () => {
    colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
  }

  const initTheme = () => {
    // No-op: Nuxt UI handles initialization automatically
  }

  return {
    theme,
    toggleTheme,
    initTheme
  }
}
