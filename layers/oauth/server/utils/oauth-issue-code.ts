import crypto from 'crypto'
import type { H3Event } from 'h3'
import { sql } from 'kysely'
import { db } from '#core/server/utils/database'
import { sha256Hex, newAuthorizationCode } from './oauth-crypto'
import { getOauthConfig } from './oauth-config'
import { logOauthEvent, OAUTH_EVENTS } from './oauth-audit'

interface IssueCodeOptions {
  clientId: string
  userId: string
  redirectUri: string
  scope: string
  resource: string
  codeChallenge: string
  event?: H3Event
}

export async function issueCode(opts: IssueCodeOptions): Promise<{ code: string, familyId: string }> {
  const cfg = getOauthConfig()
  const familyId = crypto.randomUUID()
  const code = newAuthorizationCode()
  const codeHash = sha256Hex(code)

  await db.transaction().execute(async (trx) => {
    await trx.insertInto('oauth_token_families').values({
      family_id: familyId,
      user_id: opts.userId,
      client_id: opts.clientId
    }).execute()

    await trx.insertInto('oauth_authorization_codes').values({
      code_hash: codeHash,
      client_id: opts.clientId,
      user_id: opts.userId,
      redirect_uri: opts.redirectUri,
      scope: opts.scope,
      resource: opts.resource,
      code_challenge: opts.codeChallenge,
      family_id: familyId,
      expires: sql<Date>`now() + interval '${sql.raw(String(cfg.authorizationCodeTtl))} seconds'`
    }).execute()
  })

  logOauthEvent({
    event: OAUTH_EVENTS.AUTHORIZATION_CODE_ISSUED,
    userId: opts.userId,
    event3: opts.event,
    metadata: {
      client_id: opts.clientId,
      resource: opts.resource,
      scope: opts.scope,
      family_id: familyId
    }
  })

  return { code, familyId }
}
