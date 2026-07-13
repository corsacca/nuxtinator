// Knowledge base service. Anonymised Q&A entries grown from resolved threads;
// active entries ground future AI drafts. Kernel-style — every function takes a
// scope `tx` and never imports `db`. status is a zod-owned open vocabulary
// (active|archived); RLS scopes every read/write to the active org in multi mode.
import type { Selectable, Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

type Tx = Transaction<Database>

export type InboxKnowledgeRow = Selectable<Database['inbox_knowledge_entries']>
export type InboxKnowledgeStatus = 'active' | 'archived'
export const INBOX_KNOWLEDGE_STATUSES = ['active', 'archived'] as const

export async function inboxCreateKnowledgeEntry(tx: Tx, data: {
  question: string
  answer: string
  language?: string
  sourceConversationId?: string | null
  createdBy?: string | null
}): Promise<InboxKnowledgeRow> {
  return await tx
    .insertInto('inbox_knowledge_entries')
    .values({
      question: data.question,
      answer: data.answer,
      language: data.language || 'en',
      source_conversation_id: data.sourceConversationId ?? null,
      created_by: data.createdBy ?? null
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function inboxGetKnowledgeEntry(tx: Tx, id: string): Promise<InboxKnowledgeRow | null> {
  const row = await tx
    .selectFrom('inbox_knowledge_entries')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  return row ?? null
}

export async function inboxListKnowledgeEntries(
  tx: Tx,
  opts: { status?: InboxKnowledgeStatus } = {}
): Promise<InboxKnowledgeRow[]> {
  let q = tx.selectFrom('inbox_knowledge_entries').selectAll()
  if (opts.status) q = q.where('status', '=', opts.status)
  return await q.orderBy('updated_at', 'desc').execute()
}

// The active set the AI drafter reads.
export async function inboxListActiveKnowledge(tx: Tx): Promise<InboxKnowledgeRow[]> {
  return await inboxListKnowledgeEntries(tx, { status: 'active' })
}

// Partial update — only supplied keys change. Returns null when no row matches.
export async function inboxUpdateKnowledgeEntry(tx: Tx, id: string, data: {
  question?: string
  answer?: string
  language?: string
  status?: InboxKnowledgeStatus
}): Promise<InboxKnowledgeRow | null> {
  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (data.question !== undefined) patch.question = data.question
  if (data.answer !== undefined) patch.answer = data.answer
  if (data.language !== undefined) patch.language = data.language
  if (data.status !== undefined) patch.status = data.status

  const row = await tx
    .updateTable('inbox_knowledge_entries')
    .set(patch)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()
  return row ?? null
}

export async function inboxDeleteKnowledgeEntry(tx: Tx, id: string): Promise<boolean> {
  const result = await tx
    .deleteFrom('inbox_knowledge_entries')
    .where('id', '=', id)
    .executeTakeFirst()
  return Number(result.numDeletedRows ?? 0) > 0
}

export interface InboxKnowledgeDto {
  id: string
  question: string
  answer: string
  language: string
  status: string
  sourceConversationId: string | null
  createdAt: string
  updatedAt: string
}

// Row → client shape (snake→camel; dates to ISO strings).
export function inboxKnowledgeToDto(row: InboxKnowledgeRow): InboxKnowledgeDto {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    language: row.language,
    status: row.status,
    sourceConversationId: row.source_conversation_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}
