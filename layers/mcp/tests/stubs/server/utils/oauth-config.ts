// Test stub for the OAuth layer's oauth-config. Tests configure the resource
// origin via `setTestOauthConfig`.

interface TestOauthConfig {
  mcpResource: string
  issuer: string
}

let _config: TestOauthConfig = {
  mcpResource: 'http://localhost:3033/mcp',
  issuer: 'http://localhost:3033'
}

export function setTestOauthConfig(cfg: Partial<TestOauthConfig>): void {
  _config = { ..._config, ...cfg }
}

export function getOauthConfig(): TestOauthConfig {
  return _config
}

export function tryGetOauthConfig(): TestOauthConfig | null {
  return _config
}
