// Grounding-documents service. Snapshots of external reference content the AI
// drafter grounds on. Kernel-style — every function takes a scope `tx` and never
// imports `db`. Upsert is read-then-write (not ON CONFLICT) so it's mode-
// agnostic: the unique is (source, doc_key) in single mode but (org_id, source,
// doc_key) in multi mode, and RLS already scopes the read/write to the org.
import type { Selectable, Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

type Tx = Transaction<Database>

export type InboxGroundingRow = Selectable<Database['inbox_grounding_documents']>

// The default source id for docs synced from configured page URLs.
export const INBOX_GROUNDING_SOURCE_PAGE = 'page'

export async function inboxUpsertGroundingDocument(tx: Tx, data: {
  source: string
  docKey: string
  title?: string | null
  bodyText: string
}): Promise<InboxGroundingRow> {
  const existing = await tx
    .selectFrom('inbox_grounding_documents')
    .select('id')
    .where('source', '=', data.source)
    .where('doc_key', '=', data.docKey)
    .executeTakeFirst()

  if (existing) {
    return await tx
      .updateTable('inbox_grounding_documents')
      .set({ title: data.title ?? null, body_text: data.bodyText, fetched_at: new Date() })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  return await tx
    .insertInto('inbox_grounding_documents')
    .values({ source: data.source, doc_key: data.docKey, title: data.title ?? null, body_text: data.bodyText })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function inboxListGroundingDocuments(tx: Tx, source?: string): Promise<InboxGroundingRow[]> {
  let q = tx.selectFrom('inbox_grounding_documents').selectAll()
  if (source) q = q.where('source', '=', source)
  return await q.orderBy('source', 'asc').orderBy('doc_key', 'asc').execute()
}

// max(fetched_at) as an opaque string — the cross-instance cache-freshness key.
// A sync on any replica bumps it, so others rebuild their static pack next draft.
export async function inboxLatestGroundingFetchedAt(tx: Tx, source?: string): Promise<string | null> {
  let q = tx.selectFrom('inbox_grounding_documents').select(({ fn }) => fn.max('fetched_at').as('latest'))
  if (source) q = q.where('source', '=', source)
  const row = await q.executeTakeFirst()
  return row?.latest == null ? null : String(row.latest)
}

// Prune snapshots whose doc_key is no longer configured. Returns 0 early on an
// empty key list — a guard against a bad config wiping every snapshot.
export async function inboxDeleteGroundingKeysNotIn(tx: Tx, source: string, keys: string[]): Promise<number> {
  if (!keys.length) return 0
  const result = await tx
    .deleteFrom('inbox_grounding_documents')
    .where('source', '=', source)
    .where('doc_key', 'not in', keys)
    .executeTakeFirst()
  return Number(result.numDeletedRows ?? 0)
}
