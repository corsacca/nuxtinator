// Canned responses — shared, org-wide reply snippets. Every read/write rides
// the caller's org transaction so RLS scopes rows to the org. Single-body HTML;
// the body is sanitized at the outbound sink when a reply is sent (same as any
// composed HTML), so it is stored verbatim here.
import type { Selectable, Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

type Tx = Transaction<Database>

export type InboxCannedResponseRow = Selectable<Database['inbox_canned_responses']>

export async function inboxListCanned(tx: Tx): Promise<InboxCannedResponseRow[]> {
  return await tx
    .selectFrom('inbox_canned_responses')
    .selectAll()
    .orderBy('title', 'asc')
    .execute()
}

export async function inboxGetCanned(tx: Tx, id: string): Promise<InboxCannedResponseRow | null> {
  const row = await tx
    .selectFrom('inbox_canned_responses')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  return row ?? null
}

export async function inboxCreateCanned(
  tx: Tx,
  data: { title: string, bodyHtml: string, createdBy?: string | null }
): Promise<InboxCannedResponseRow> {
  return await tx
    .insertInto('inbox_canned_responses')
    .values({
      title: data.title,
      body_html: data.bodyHtml,
      created_by: data.createdBy ?? null
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

// Partial update: a title-only edit still bumps updated_at; an omitted field is
// left untouched (only present keys are written).
export async function inboxUpdateCanned(
  tx: Tx,
  id: string,
  patch: { title?: string, bodyHtml?: string }
): Promise<InboxCannedResponseRow | null> {
  const row = await tx
    .updateTable('inbox_canned_responses')
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.bodyHtml !== undefined ? { body_html: patch.bodyHtml } : {}),
      updated_at: new Date()
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()
  return row ?? null
}

export async function inboxDeleteCanned(tx: Tx, id: string): Promise<boolean> {
  const res = await tx
    .deleteFrom('inbox_canned_responses')
    .where('id', '=', id)
    .executeTakeFirst()
  return Number(res.numDeletedRows ?? 0) > 0
}
