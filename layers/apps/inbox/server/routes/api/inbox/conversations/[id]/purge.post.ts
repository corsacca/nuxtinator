// POST /api/inbox/conversations/:id/purge
// GDPR erasure of a thread: hard-delete the conversation (cascading its
// messages/attachments/notes/comment rows) AND delete the private S3 objects
// those rows point at (raw MIME + attachment blobs), which the DB cascade
// leaves orphaned. Admin-gated and irreversible. Keys are gathered before the
// DB delete; the S3 delete runs post-commit and is best-effort, so a storage
// hiccup can't un-delete the DB rows.
import { withOrgPermission } from '#tenant/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const keys = await withOrgPermission(event, { appId: 'inbox' }, 'inbox.send', async (tx, ctx) => {
    if (!ctx.roles.includes('admin')) {
      throw createError({ statusCode: 403, statusMessage: 'Only an admin can purge a conversation' })
    }
    const conversation = await inboxGetConversation(tx, id)
    if (!conversation) {
      throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    }
    // A key-gather failure must not block the delete.
    let collected: string[] = []
    try {
      collected = await inboxCollectConversationS3Keys(tx, id)
    } catch (err) {
      console.warn('[inbox] purge key-gather failed:', err instanceof Error ? err.message : err)
    }
    await tx.deleteFrom('inbox_conversations').where('id', '=', id).execute()
    return collected
  })

  const result = await inboxDeleteS3Keys(keys)
  return { ok: true, ...result }
})
