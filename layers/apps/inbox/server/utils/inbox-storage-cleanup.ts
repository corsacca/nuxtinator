// S3 lifecycle cleanup. The inbox stores two kinds of private objects: raw
// inbound MIME (inbox_messages.raw_s3_key — a full copy of the email, the
// biggest PII item) and attachment blobs (inbox_attachments.s3_key). Deleting a
// conversation or an org CASCADEs the DB rows but never the S3 objects, so they
// must be deleted explicitly or they orphan forever. Cleanup is best-effort: a
// per-key failure logs and continues, and a key-gather failure must never block
// the DB delete. (Composer inline images under inline/ are not DB-tracked and
// orphan by design.)
import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { deleteFromS3 } from '#core/server/utils/storage'

type Tx = Transaction<Database>

// Every private S3 key belonging to one conversation: its messages' raw MIME
// and their attachments.
export async function inboxCollectConversationS3Keys(tx: Tx, conversationId: string): Promise<string[]> {
  const keys: string[] = []
  const raws = await tx
    .selectFrom('inbox_messages')
    .select('raw_s3_key')
    .where('conversation_id', '=', conversationId)
    .where('raw_s3_key', 'is not', null)
    .execute()
  for (const r of raws) if (r.raw_s3_key) keys.push(r.raw_s3_key)
  const atts = await tx
    .selectFrom('inbox_attachments as a')
    .innerJoin('inbox_messages as m', 'm.id', 'a.message_id')
    .select('a.s3_key')
    .where('m.conversation_id', '=', conversationId)
    .execute()
  for (const a of atts) keys.push(a.s3_key)
  return keys
}

// Every private S3 key in the current org scope (for org offboarding — call
// before the org's rows cascade away). RLS scopes both reads to the org.
export async function inboxCollectOrgS3Keys(tx: Tx): Promise<string[]> {
  const keys: string[] = []
  const raws = await tx
    .selectFrom('inbox_messages')
    .select('raw_s3_key')
    .where('raw_s3_key', 'is not', null)
    .execute()
  for (const r of raws) if (r.raw_s3_key) keys.push(r.raw_s3_key)
  const atts = await tx.selectFrom('inbox_attachments').select('s3_key').execute()
  for (const a of atts) keys.push(a.s3_key)
  return keys
}

// Best-effort delete — never throws; a per-key failure is logged and skipped.
export async function inboxDeleteS3Keys(keys: string[]): Promise<{ deleted: number, failed: number }> {
  let deleted = 0
  let failed = 0
  for (const key of keys) {
    try {
      await deleteFromS3(key, 'private')
      deleted++
    } catch (err) {
      failed++
      console.warn(`[inbox] S3 cleanup failed for ${key}:`, err instanceof Error ? err.message : err)
    }
  }
  return { deleted, failed }
}
