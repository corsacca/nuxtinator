// OAuth runtime config, validated at boot by server/plugins/oauth-config-validate.ts.
// Issuer and mcpResource are derived from runtimeConfig.public.siteUrl.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase())
}

export interface OauthConfig {
  issuer: string
  mcpResource: string
  loginPath: string
  consentCookieSecret: string
  accessTokenTtl: number
  refreshTokenTtl: number
  authorizationCodeTtl: number
  pendingRequestTtl: number
  allowDcr: boolean
}

let _oauthConfig: OauthConfig | null = null

export function normalizeIssuer(value: string): string {
  const url = new URL(value)
  const isHttps = url.protocol === 'https:'
  const isDevLoopback = url.protocol === 'http:' && isLoopbackHost(url.hostname)
  if (!isHttps && !isDevLoopback) {
    throw new Error(`Issuer must be https:// (or http:// for localhost in dev), got ${url.protocol}`)
  }
  if (url.pathname !== '' && url.pathname !== '/') {
    throw new Error(`Issuer must be origin-only (no path), got pathname=${url.pathname}`)
  }
  if (url.search || url.hash) {
    throw new Error('Issuer must not contain query or fragment')
  }
  if (url.username || url.password) {
    throw new Error('Issuer must not contain userinfo')
  }
  return url.origin
}

export function normalizeMcpResource(value: string): string {
  const url = new URL(value)
  const isHttps = url.protocol === 'https:'
  const isDevLoopback = url.protocol === 'http:' && isLoopbackHost(url.hostname)
  if (!isHttps && !isDevLoopback) {
    throw new Error(`MCP resource must be https:// (or http:// for localhost in dev)`)
  }
  if (url.hash) {
    throw new Error('MCP resource must not contain a fragment')
  }
  if (url.username || url.password) {
    throw new Error('MCP resource must not contain userinfo')
  }
  return url.toString()
}

export function setOauthConfig(cfg: OauthConfig) {
  _oauthConfig = cfg
}

export function getOauthConfig(): OauthConfig {
  if (!_oauthConfig) {
    throw new Error('OAuth config not initialized — did the oauth-config-validate plugin run?')
  }
  return _oauthConfig
}

export function tryGetOauthConfig(): OauthConfig | null {
  return _oauthConfig
}
