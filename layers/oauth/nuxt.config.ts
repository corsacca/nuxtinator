// OAuth 2.1 server layer for MCP-compatible token issuance.
// See README.md for consumer requirements.
//
// `#oauth/*` aliases are exposed for sibling layers (notably MCP) that need
// to reach into this layer's server utilities without relative paths. When
// each layer is downloaded into its own directory (e.g. via giget), there is
// no shared parent on disk for `../../../oauth/...` to resolve against — but
// once a consumer extends both layers, Nuxt merges these aliases into the
// consumer's resolution and the imports resolve to the OAuth layer wherever
// it actually lives.
import { fileURLToPath } from 'node:url'

const layerRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineNuxtConfig({
  alias: {
    '#oauth/bearer': fileURLToPath(new URL('./server/utils/oauth-bearer.ts', import.meta.url)),
    '#oauth/config': fileURLToPath(new URL('./server/utils/oauth-config.ts', import.meta.url)),
    '#oauth/scopes': fileURLToPath(new URL('./server/utils/scopes-registry.ts', import.meta.url))
  },

  nitro: {
    typescript: {
      tsConfig: {
        compilerOptions: {
          paths: {
            '#oauth/bearer': [`${layerRoot}server/utils/oauth-bearer.ts`],
            '#oauth/config': [`${layerRoot}server/utils/oauth-config.ts`],
            '#oauth/scopes': [`${layerRoot}server/utils/scopes-registry.ts`]
          }
        }
      }
    }
  },

  runtimeConfig: {
    oauthConsentCookieSecret: process.env.OAUTH_CONSENT_COOKIE_SECRET || '',
    oauthAccessTokenTtlSeconds: 3600,
    oauthRefreshTokenTtlSeconds: 2592000,
    oauthAuthorizationCodeTtlSeconds: 60,
    oauthPendingRequestTtlSeconds: 300,
    oauthAllowDynamicClientRegistration: process.env.OAUTH_ALLOW_DCR === 'true',
    // When true, the layer's default `oauth:consent-granted` email
    // subscriber (server/plugins/oauth-notify.ts) is skipped. Set
    // this when the consumer ships its own subscriber (branded HTML,
    // i18n copy, alternative transport).
    oauthDisableConsentGrantedEmail: false,
    oauth: {
      loginPath: '/login'
    }
  }
})
