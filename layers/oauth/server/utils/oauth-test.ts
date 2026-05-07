// Test-only helpers for the OAuth layer. Production-guarded.
//
// The production token issuance path lives inline inside routes/oauth/token.post.ts
// (authorization-code grant + refresh grant), so MCP-layer integration tests have no
// clean way to mint a valid `oauth_access_tokens` row without driving the full
// HTTP /oauth/authorize + /oauth/token round-trip. These helpers write the same
// shapes the production code uses and return both the plaintext token and the row
// ids the harness needs for cleanup.
import { sql } from 'kysely'
import { db } from '#core/server/utils/database'
import { sha256Hex, newAccessToken, randomTokenHex } from './oauth-crypto'
import { getOauthConfig } from './oauth-config'

function assertNotProd(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('oauth-test helpers are not callable in production')
  }
}

export interface CreateAccessTokenForTestOpts {
  userId: string
  clientId: string
  scopes: string[]
  resource?: string
  expiresInMs?: number
  revoked?: boolean
}

export interface CreateAccessTokenForTestResult {
  token: string
  tokenId: string
  familyId: string
}

// Mints an oauth_token_families + oauth_access_tokens pair the same way the
// production token endpoint does. Returns the plaintext token and the row ids
// so the test harness can track them for cleanup.
export async function __createAccessTokenForTest(
  opts: CreateAccessTokenForTestOpts
): Promise<CreateAccessTokenForTestResult> {
  assertNotProd()

  const cfg = getOauthConfig()
  const resource = opts.resource ?? cfg.mcpResource
  const expiresInMs = opts.expiresInMs ?? 60 * 60 * 1000
  const familyId = `fam_${randomTokenHex(16)}`
  const plaintext = newAccessToken()

  return await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('oauth_token_families')
      .values({
        family_id: familyId,
        user_id: opts.userId,
        client_id: opts.clientId,
        revoked: opts.revoked ?? false
      })
      .execute()

    const accessRow = await trx
      .insertInto('oauth_access_tokens')
      .values({
        token_hash: sha256Hex(plaintext),
        client_id: opts.clientId,
        user_id: opts.userId,
        scope: opts.scopes.join(' '),
        resource,
        family_id: familyId,
        expires: sql<Date>`now() + interval '${sql.raw(String(Math.ceil(expiresInMs / 1000)))} seconds'`,
        revoked: opts.revoked ?? false
      })
      .returning(['id'])
      .executeTakeFirstOrThrow()

    return {
      token: plaintext,
      tokenId: accessRow.id,
      familyId
    }
  })
}
