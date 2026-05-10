// Markdown validation for MCP write tools.
//
// The data model stores raw markdown (`messages_items.body_md`,
// `messages_comments.body_md`) and mention syntax is the markdown link
// `[@DisplayName](user-uuid)`. Compared to the original plan, there is no
// TipTap JSON ↔ markdown round-trip needed — markdown is already the
// canonical format on both the UI and MCP sides.
//
// Responsibilities here:
//   - Hard-fail on mentions whose UUID doesn't resolve to an org member
//     (the plan's "hard-fail on invalid user-id" rule).
//   - Enforce a body-size cap (LLM-generated content gets the same ceiling
//     as UI-generated; oversized docs rejected).

import type { Transaction } from 'kysely'
import type { Database } from '~/server/database/schema'
import { extractMentions } from './markdown-mentions'

export const MAX_ITEM_BODY_BYTES = 64 * 1024
export const MAX_COMMENT_BODY_BYTES = 32 * 1024

export interface ValidateMcpMarkdownOpts {
  orgId: string | null
  maxBytes: number
}

// Rejects oversized bodies and mentions to non-members. Returns the input
// unchanged when valid; throws an h3 error on failure.
export async function validateMcpMarkdown(
  tx: Transaction<Database>,
  bodyMd: string,
  opts: ValidateMcpMarkdownOpts
): Promise<string> {
  if (Buffer.byteLength(bodyMd, 'utf8') > opts.maxBytes) {
    throw createError({
      statusCode: 413,
      statusMessage: `Body exceeds max size of ${opts.maxBytes} bytes`
    })
  }

  const mentions = extractMentions(bodyMd)
  if (mentions.length === 0) return bodyMd

  const ids = mentions.map(m => m.id)
  let resolved: Set<string>
  if (opts.orgId) {
    const rows = await tx
      .selectFrom('memberships')
      .select('user_id')
      .where('user_id', 'in', ids)
      .where('org_id', '=', opts.orgId)
      .execute()
    resolved = new Set(rows.map(r => r.user_id))
  } else {
    // Single-tenant fallback: the deployment is one logical org, so ANY real
    // user is a valid mention target. Don't call this with `orgId: null` from
    // a multi-tenant code path — it would let an MCP tool mention users from
    // other orgs.
    const rows = await tx
      .selectFrom('users')
      .select('id')
      .where('id', 'in', ids)
      .execute()
    resolved = new Set(rows.map(r => r.id))
  }

  const unresolved = mentions.filter(m => !resolved.has(m.id))
  if (unresolved.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `Mention(s) reference unknown user(s): ${unresolved.map(m => m.id).join(', ')}`
    })
  }
  return bodyMd
}
