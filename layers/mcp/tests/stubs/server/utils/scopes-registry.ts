// Test stub for the OAuth layer's scopes-registry. The MCP-layer registry
// calls registerScope() when a tool or resource is registered; unit tests
// don't read back the registered set, so the stub just needs to accept the
// calls without side-effects that would leak between tests.

const _scopes: Set<string> = new Set()

export function registerScope(scope: string): void {
  if (typeof scope !== 'string' || scope.length === 0) return
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
  _scopes.clear()
}
