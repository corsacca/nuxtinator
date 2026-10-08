// Env-derived OpenRouter settings. The host key here is the deployment-wide
// fallback: an org with its own stored key (see ai-settings) never uses it.
export interface OpenRouterConfig {
  apiKey: string
  baseUrl: string
  referer: string
  title: string
}

export function getOpenRouterConfig(): OpenRouterConfig {
  const c = useRuntimeConfig()
  return {
    apiKey: (c.openrouterApiKey as string) || process.env.OPENROUTER_API_KEY || '',
    baseUrl: ((c.openrouterBaseUrl as string) || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    referer: (c.aiHttpReferer as string) || '',
    title: (c.aiAppTitle as string) || ''
  }
}

export function getHostApiKey(): string {
  return getOpenRouterConfig().apiKey
}

// Env-derived Tinfoil settings. Tinfoil runs on the host's key only; orgs
// cannot store their own.
export interface TinfoilConfig {
  apiKey: string
  catalogUrl: string
}

export function getTinfoilConfig(): TinfoilConfig {
  const c = useRuntimeConfig()
  return {
    apiKey: (c.tinfoilApiKey as string) || process.env.TINFOIL_API_KEY || '',
    catalogUrl: (c.tinfoilCatalogUrl as string) || 'https://api.tinfoil.sh/api/config/models'
  }
}

export function isTinfoilConfigured(): boolean {
  return !!getTinfoilConfig().apiKey
}
