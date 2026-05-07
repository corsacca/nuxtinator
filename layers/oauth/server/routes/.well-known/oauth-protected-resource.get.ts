import { getOauthConfig } from '../../utils/oauth-config'
import { getAdvertisedScopes } from '../../utils/oauth-validation'

export default defineEventHandler(() => {
  const cfg = getOauthConfig()
  return {
    resource: cfg.mcpResource,
    authorization_servers: [cfg.issuer],
    scopes_supported: getAdvertisedScopes(),
    bearer_methods_supported: ['header']
  }
})
