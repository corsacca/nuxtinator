// Test stub for the OAuth layer's oauth-bearer. Only `BearerAuth` is needed
// for the layer's internal types. `requireValidBearer` isn't used in unit
// tests — the dispatcher receives an already-validated `BearerAuth`.

export interface BearerAuth {
  userId: string
  clientId: string
  scopes: string[]
  tokenId: string
  familyId: string
}
