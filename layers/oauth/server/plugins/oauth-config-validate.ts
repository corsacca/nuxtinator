import { normalizeIssuer, normalizeMcpResource, setOauthConfig } from '../utils/oauth-config'

// Validates required runtime config and initialises the OAuth config singleton.
// Schema correctness (users.id is uuid, oauth tables present) is enforced by the
// FK constraints in the layer's own migration — running migrations against an
// incompatible users table fails with a clear Postgres error.
export default defineNitroPlugin(() => {
  const cfg = useRuntimeConfig()
  const siteUrl = cfg.public?.siteUrl

  if (!siteUrl) {
    console.warn('[oauth-layer] NUXT_PUBLIC_SITE_URL not set — OAuth server disabled')
    return
  }

  if (!cfg.oauthConsentCookieSecret || String(cfg.oauthConsentCookieSecret).length < 32) {
    console.warn('[oauth-layer] OAUTH_CONSENT_COOKIE_SECRET not set or shorter than 32 chars — OAuth server disabled. See layer README.')
    return
  }

  const issuer = normalizeIssuer(String(siteUrl))
  const mcpResource = normalizeMcpResource(`${issuer}/mcp`)
  const loginPath = (cfg.oauth as { loginPath?: string } | undefined)?.loginPath || '/login'

  setOauthConfig({
    issuer,
    mcpResource,
    loginPath,
    consentCookieSecret: String(cfg.oauthConsentCookieSecret),
    accessTokenTtl: Number(cfg.oauthAccessTokenTtlSeconds) || 3600,
    refreshTokenTtl: Number(cfg.oauthRefreshTokenTtlSeconds) || 2592000,
    authorizationCodeTtl: Number(cfg.oauthAuthorizationCodeTtlSeconds) || 60,
    pendingRequestTtl: Number(cfg.oauthPendingRequestTtlSeconds) || 300,
    allowDcr: Boolean(cfg.oauthAllowDynamicClientRegistration)
  })

  console.log(`[oauth-layer] OAuth server ready: issuer=${issuer} resource=${mcpResource} DCR=${cfg.oauthAllowDynamicClientRegistration ? 'on' : 'off'}`)
})
