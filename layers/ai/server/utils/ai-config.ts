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
