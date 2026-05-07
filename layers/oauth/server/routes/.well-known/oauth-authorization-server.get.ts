import { getOauthConfig } from '../../utils/oauth-config'
import { getAdvertisedScopes } from '../../utils/oauth-validation'

export default defineEventHandler(() => {
  const cfg = getOauthConfig()
  const body: Record<string, unknown> = {
    issuer: cfg.issuer,
    authorization_endpoint: `${cfg.issuer}/oauth/authorize`,
    token_endpoint: `${cfg.issuer}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: getAdvertisedScopes(),
    response_modes_supported: ['query'],
    authorization_response_iss_parameter_supported: true
  }
  if (cfg.allowDcr) {
    body.registration_endpoint = `${cfg.issuer}/oauth/register`
  }
  return body
})
