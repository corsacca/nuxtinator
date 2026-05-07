// Module-level singleton scope registry. Layers and feature plugins
// call `registerScope(scope)` at boot to declare which scopes their
// surface needs; the OAuth discovery handlers and the DCR explicit-
// scope ceiling read the union via `getRegisteredScopes()`.
//
// Pattern mirrors the MCP layer's tool registry: a per-process value
// backed by a module-level Set so any plugin in any layer can
// contribute regardless of plugin-load order. The OAuth layer holds
// no dependency on the MCP layer; instead the MCP registry calls
// `registerScope()` when a tool or resource is registered.

const _scopes: Set<string> = new Set()

export function registerScope(scope: string): void {
  if (typeof scope !== 'string' || scope.length === 0) return
  // We don't gate on isPermission here — protocol scopes like
  // `offline_access` are valid contributions too. The DCR ceiling
  // and isValidScope() handle final validation against
  // PERMISSIONS + OFFLINE_ACCESS_SCOPE.
  _scopes.add(scope)
}

export function registerScopes(scopes: ReadonlyArray<string>): void {
  for (const s of scopes) registerScope(s)
}

export function getRegisteredScopes(): string[] {
  return Array.from(_scopes)
}

export function hasRegisteredScopes(): boolean {
  return _scopes.size > 0
}

export function __resetScopesForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetScopesForTests is not callable in production')
  }
  _scopes.clear()
}
