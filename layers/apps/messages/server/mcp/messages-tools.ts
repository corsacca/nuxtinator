// MCP tool definitions for the messages layer.
//
// Read tools use scope `messages.read`; write tools use `messages.write`.
// All tools run inside `runInOrgTransaction(event, ...)` from `#tenant/server`,
// which sets the `app.current_org` GUC in multi mode (driven by the
// `X-Active-Org` header on the MCP HTTP request) and is a plain transaction
// in single mode.
//
// The data model stores raw markdown — there is no TipTap JSON ↔ markdown
// round-trip needed for the body. Mention validation hard-fails on
// unresolvable user IDs (`validateMcpMarkdown`).
//
// Write tools log to `activity_logs` via `mcpLog` so the audit trail captures
// `source: 'mcp'`, the calling client, and the tool name.

import { z } from 'zod'
import { sql, type Kysely } from 'kysely'
import { defineMcpTool, mcpError, mcpLog, type McpToolContext } from '#mcp-layer'
import type { Database as CoreDatabase } from '#core/server/database/schema'
import { runInOrgTransaction } from '#tenant/server'
import { extractMentions } from '../utils/markdown-mentions'
import { fanoutMentions } from '../utils/mention-fanout'
import { createNotifications } from '../utils/notification-creator'
import { getDmMemberIds } from '../utils/dm-members'
import { requireConversationAccess, loadConversation } from '../utils/conversation-access'
import {
  validateMcpMarkdown,
  MAX_ITEM_BODY_BYTES,
  MAX_COMMENT_BODY_BYTES
} from '../utils/mcp-markdown'
import { sendDmEmail, sendMentionEmail } from '../utils/messages-email'

function getOrgId(ctx: McpToolContext): string | null {
  return (ctx.event.context.orgId as string | undefined) ?? null
}

// The mcp-audit layer types its executor as `Kysely<CoreDatabase>` (core-only
// schema), while messages-layer transactions carry the augmented Database type.
// They're structurally identical at runtime; the cast is a TS-side bridge.
function asAuditExecutor(tx: unknown): Kysely<CoreDatabase> {
  return tx as Kysely<CoreDatabase>
}

function textResult(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structured ? { structuredContent: structured } : {})
  }
}

// ─── Read tools ─────────────────────────────────────────────────────────────

export const listConversationsTool = defineMcpTool({
  name: 'messages_list_conversations',
  description: 'List channels and DMs the calling user has access to in the active org. Includes unread counts.',
  scope: 'messages.read',
  input: z.object({}).strict(),
  handler: async (_input, ctx) => {
    return await runInOrgTransaction(ctx.event, async (tx) => {
      const userId = ctx.auth.userId

      const channels = await tx
        .selectFrom('messages_conversations as c')
        .leftJoin('messages_conversation_reads as r', join =>
          join.onRef('r.conversation_id', '=', 'c.id').on('r.user_id', '=', userId))
        .select([
          'c.id',
          'c.name',
          'c.description',
          eb => eb.fn.coalesce('r.last_read_at', sql<Date>`'epoch'::timestamptz`).as('last_read_at')
        ])
        .where('c.kind', '=', 'channel')
        .where('c.archived_at', 'is', null)
        .orderBy('c.name', 'asc')
        .execute()

      const dms = await tx
        .selectFrom('messages_conversations as c')
        .innerJoin('messages_conversation_members as m', join =>
          join.onRef('m.conversation_id', '=', 'c.id').on('m.user_id', '=', userId))
        .leftJoin('messages_conversation_reads as r', join =>
          join.onRef('r.conversation_id', '=', 'c.id').on('r.user_id', '=', userId))
        .select([
          'c.id',
          eb => eb.fn.coalesce('r.last_read_at', sql<Date>`'epoch'::timestamptz`).as('last_read_at')
        ])
        .where('c.kind', '=', 'dm')
        .where('c.archived_at', 'is', null)
        .execute()

      const channelOut = []
      for (const c of channels) {
        const unreadRow = await tx
          .selectFrom('messages_items')
          .select(eb => eb.fn.countAll<string>().as('c'))
          .where('conversation_id', '=', c.id)
          .where('created_at', '>', c.last_read_at as Date)
          .where('deleted_at', 'is', null)
          .where('author_id', '!=', userId)
          .executeTakeFirst()
        channelOut.push({
          id: c.id,
          kind: 'channel' as const,
          name: c.name,
          description: c.description,
          unread_count: Number(unreadRow?.c ?? 0)
        })
      }

      const dmOut = []
      for (const d of dms) {
        const members = await tx
          .selectFrom('messages_conversation_members as m')
          .innerJoin('users', 'users.id', 'm.user_id')
          .select(['users.id', 'users.display_name'])
          .where('m.conversation_id', '=', d.id)
          .execute()
        const unreadRow = await tx
          .selectFrom('messages_items')
          .select(eb => eb.fn.countAll<string>().as('c'))
          .where('conversation_id', '=', d.id)
          .where('created_at', '>', d.last_read_at as Date)
          .where('deleted_at', 'is', null)
          .where('author_id', '!=', userId)
          .executeTakeFirst()
        dmOut.push({
          id: d.id,
          kind: 'dm' as const,
          members: members.map(m => ({ id: m.id, display_name: m.display_name })),
          unread_count: Number(unreadRow?.c ?? 0)
        })
      }

      return textResult(
        `${channelOut.length} channel(s), ${dmOut.length} DM(s)`,
        { channels: channelOut, dms: dmOut }
      )
    })
  }
})

export const listItemsTool = defineMcpTool({
  name: 'messages_list_items',
  description: 'List items in a conversation, newest first. Body returned as markdown.',
  scope: 'messages.read',
  input: z.object({
    conversation_id: z.string().uuid(),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional()
  }).strict(),
  handler: async (input, ctx) => {
    const limit = input.limit ?? 30
    return await runInOrgTransaction(ctx.event, async (tx) => {
      const conv = await requireConversationAccess(tx, ctx.auth.userId, input.conversation_id)

      let qb = tx
        .selectFrom('messages_items as i')
        .innerJoin('users as u', 'u.id', 'i.author_id')
        .select([
          'i.id',
          'i.kind',
          'i.body_md',
          'i.filename',
          'i.mime',
          'i.created_at',
          'i.edited_at',
          'i.author_id',
          'u.display_name as author_name'
        ])
        .where('i.conversation_id', '=', conv.id)
        .where('i.deleted_at', 'is', null)
        .orderBy('i.created_at', 'desc')
        .limit(limit + 1)
      if (input.cursor) qb = qb.where('i.created_at', '<', input.cursor)

      const rows = await qb.execute()
      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows

      const items = page.map(r => ({
        id: r.id,
        kind: r.kind,
        body_md: r.body_md,
        filename: r.filename,
        mime: r.mime,
        created_at: (r.created_at as Date).toISOString(),
        edited_at: r.edited_at ? (r.edited_at as Date).toISOString() : null,
        author: { id: r.author_id, display_name: r.author_name }
      }))

      return textResult(
        `${items.length} item(s)${hasMore ? ' (more available)' : ''}`,
        { items, next_cursor: hasMore ? (page[page.length - 1]!.created_at as Date).toISOString() : null }
      )
    })
  }
})

export const readItemTool = defineMcpTool({
  name: 'messages_read_item',
  description: 'Read a single item with all its comments. Bodies returned as markdown.',
  scope: 'messages.read',
  input: z.object({ item_id: z.string().uuid() }).strict(),
  handler: async (input, ctx) => {
    return await runInOrgTransaction(ctx.event, async (tx) => {
      const item = await tx
        .selectFrom('messages_items as i')
        .innerJoin('users as u', 'u.id', 'i.author_id')
        .select([
          'i.id',
          'i.conversation_id',
          'i.kind',
          'i.body_md',
          'i.filename',
          'i.mime',
          'i.created_at',
          'i.edited_at',
          'i.author_id',
          'u.display_name as author_name'
        ])
        .where('i.id', '=', input.item_id)
        .where('i.deleted_at', 'is', null)
        .executeTakeFirst()
      if (!item) {
        throw createError({ statusCode: 404, statusMessage: 'Item not found.' })
      }
      await requireConversationAccess(tx, ctx.auth.userId, item.conversation_id)

      const comments = await tx
        .selectFrom('messages_comments as c')
        .innerJoin('users as u', 'u.id', 'c.author_id')
        .select([
          'c.id',
          'c.parent_comment_id',
          'c.body_md',
          'c.anchor',
          'c.anchor_orphaned',
          'c.created_at',
          'c.edited_at',
          'c.resolved_at',
          'c.author_id',
          'u.display_name as author_name'
        ])
        .where('c.item_id', '=', input.item_id)
        .where('c.deleted_at', 'is', null)
        .orderBy('c.created_at', 'asc')
        .execute()

      return textResult(
        `Item ${item.id} with ${comments.length} comment(s)`,
        {
          item: {
            id: item.id,
            conversation_id: item.conversation_id,
            kind: item.kind,
            body_md: item.body_md,
            filename: item.filename,
            mime: item.mime,
            created_at: (item.created_at as Date).toISOString(),
            edited_at: item.edited_at ? (item.edited_at as Date).toISOString() : null,
            author: { id: item.author_id, display_name: item.author_name }
          },
          comments: comments.map(c => ({
            id: c.id,
            parent_comment_id: c.parent_comment_id,
            body_md: c.body_md,
            anchor: c.anchor,
            anchor_orphaned: c.anchor_orphaned,
            created_at: (c.created_at as Date).toISOString(),
            edited_at: c.edited_at ? (c.edited_at as Date).toISOString() : null,
            resolved_at: c.resolved_at ? (c.resolved_at as Date).toISOString() : null,
            author: { id: c.author_id, display_name: c.author_name }
          }))
        }
      )
    })
  }
})

export const searchTool = defineMcpTool({
  name: 'messages_search',
  description: 'Postgres full-text search over messages items + comments in the active org.',
  scope: 'messages.read',
  input: z.object({
    q: z.string().min(1).max(500),
    limit: z.number().int().min(1).max(50).optional()
  }).strict(),
  handler: async (input, ctx) => {
    const limit = input.limit ?? 20
    return await runInOrgTransaction(ctx.event, async (tx) => {
      const tsQuery = sql<unknown>`websearch_to_tsquery('english', ${input.q})`

      const itemRows = await tx
        .selectFrom('messages_items as i')
        .innerJoin('users as u', 'u.id', 'i.author_id')
        .select([
          'i.id',
          'i.conversation_id',
          'i.kind',
          'i.created_at',
          'u.display_name as author_name',
          sql<string>`ts_headline('english', coalesce(i.body_md, ''), ${tsQuery}, 'MaxWords=30,MinWords=10')`.as('headline')
        ])
        .where('i.deleted_at', 'is', null)
        .where(sql<boolean>`i.body_tsv @@ ${tsQuery}`)
        .orderBy(sql`ts_rank(i.body_tsv, ${tsQuery})`, 'desc')
        .limit(limit)
        .execute()

      const commentRows = await tx
        .selectFrom('messages_comments as c')
        .innerJoin('messages_items as i', 'i.id', 'c.item_id')
        .innerJoin('users as u', 'u.id', 'c.author_id')
        .select([
          'c.id',
          'c.item_id',
          'i.conversation_id',
          'c.created_at',
          'u.display_name as author_name',
          sql<string>`ts_headline('english', c.body_md, ${tsQuery}, 'MaxWords=30,MinWords=10')`.as('headline')
        ])
        .where('c.deleted_at', 'is', null)
        .where('i.deleted_at', 'is', null)
        .where(sql<boolean>`c.body_tsv @@ ${tsQuery}`)
        .orderBy(sql`ts_rank(c.body_tsv, ${tsQuery})`, 'desc')
        .limit(limit)
        .execute()

      return textResult(
        `${itemRows.length} item match(es), ${commentRows.length} comment match(es)`,
        {
          items: itemRows.map(r => ({
            id: r.id,
            kind: r.kind,
            conversation_id: r.conversation_id,
            excerpt: r.headline,
            created_at: (r.created_at as Date).toISOString(),
            author: r.author_name
          })),
          comments: commentRows.map(r => ({
            id: r.id,
            item_id: r.item_id,
            conversation_id: r.conversation_id,
            excerpt: r.headline,
            created_at: (r.created_at as Date).toISOString(),
            author: r.author_name
          }))
        }
      )
    })
  }
})

export const listNotificationsTool = defineMcpTool({
  name: 'messages_list_notifications',
  description: 'List unread mentions, DMs, and comment notifications for the calling user.',
  scope: 'messages.read',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional(),
    unread_only: z.boolean().optional()
  }).strict(),
  handler: async (input, ctx) => {
    const limit = input.limit ?? 30
    const unreadOnly = input.unread_only ?? true
    return await runInOrgTransaction(ctx.event, async (tx) => {
      let qb = tx
        .selectFrom('messages_notifications as n')
        .leftJoin('users as actor', 'actor.id', 'n.actor_id')
        .leftJoin('messages_conversations as conv', 'conv.id', 'n.conversation_id')
        .leftJoin('messages_items as i', 'i.id', 'n.item_id')
        .leftJoin('messages_comments as c', 'c.id', 'n.comment_id')
        .select([
          'n.id',
          'n.kind',
          'n.item_id',
          'n.comment_id',
          'n.conversation_id',
          'n.created_at',
          'n.read_at',
          'actor.display_name as actor_name',
          'conv.kind as conv_kind',
          'conv.name as conv_name',
          'i.body_md as item_body',
          'c.body_md as comment_body'
        ])
        .where('n.user_id', '=', ctx.auth.userId)
        .orderBy('n.created_at', 'desc')
        .limit(limit)
      if (unreadOnly) qb = qb.where('n.read_at', 'is', null)

      const rows = await qb.execute()
      return textResult(
        `${rows.length} notification(s)`,
        {
          notifications: rows.map(r => ({
            id: r.id,
            kind: r.kind,
            item_id: r.item_id,
            comment_id: r.comment_id,
            conversation_id: r.conversation_id,
            conversation: r.conv_kind === 'channel' && r.conv_name ? `#${r.conv_name}` : (r.conv_kind ?? null),
            actor: r.actor_name,
            excerpt: ((r.comment_body ?? r.item_body) ?? '').slice(0, 240),
            created_at: (r.created_at as Date).toISOString(),
            read: !!r.read_at
          }))
        }
      )
    })
  }
})

// ─── Write tools ────────────────────────────────────────────────────────────

export const postItemTool = defineMcpTool({
  name: 'messages_post_item',
  description: 'Post a markdown item to a conversation. Mentions written as `[@DisplayName](user-uuid)` resolve to mention nodes.',
  scope: 'messages.write',
  input: z.object({
    conversation_id: z.string().uuid(),
    body_md: z.string().min(1).max(MAX_ITEM_BODY_BYTES)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      type Pending = {
        mentionRecipients: string[]
        dmRecipients: string[]
        itemId: string
        bodyMd: string
        conversationId: string
      }
      let pending: Pending | null = null

      const result = await runInOrgTransaction(ctx.event, async (tx) => {
        const orgId = getOrgId(ctx)
        const conv = await requireConversationAccess(tx, ctx.auth.userId, input.conversation_id)
        const bodyMd = await validateMcpMarkdown(tx, input.body_md, {
          orgId,
          maxBytes: MAX_ITEM_BODY_BYTES
        })

        const inserted = await tx
          .insertInto('messages_items')
          .values({
            conversation_id: conv.id,
            author_id: ctx.auth.userId,
            kind: 'markdown',
            body_md: bodyMd,
            storage_key: null,
            filename: null,
            mime: null,
            size_bytes: null
          })
          .returning(['id', 'created_at'])
          .executeTakeFirstOrThrow()

        const dmMemberIds = conv.kind === 'dm' ? await getDmMemberIds(tx, conv.id) : null
        const mentions = extractMentions(bodyMd)
        const mentionResult = await fanoutMentions(tx, mentions, {
          orgId,
          authorId: ctx.auth.userId,
          conversationId: conv.id,
          itemId: inserted.id,
          dmMemberIds
        })

        let dmRecipients: string[] = []
        if (dmMemberIds) {
          const allDmRecipients = [...dmMemberIds].filter(uid => uid !== ctx.auth.userId)
          if (allDmRecipients.length > 0) {
            await createNotifications(
              tx,
              allDmRecipients.map(uid => ({
                user_id: uid,
                kind: 'dm' as const,
                item_id: inserted.id,
                conversation_id: conv.id,
                actor_id: ctx.auth.userId
              })),
              { perEventEmail: true }
            )
          }
          dmRecipients = allDmRecipients.filter(uid => !mentionResult.notified.includes(uid))
        }

        await mcpLog('CREATE', 'messages_items', inserted.id, ctx, {
          conversation_id: conv.id,
          kind: 'markdown'
        }, asAuditExecutor(tx))

        pending = {
          mentionRecipients: mentionResult.notified,
          dmRecipients,
          itemId: inserted.id,
          bodyMd,
          conversationId: conv.id
        }

        return {
          item_id: inserted.id,
          created_at: (inserted.created_at as Date).toISOString()
        }
      })

      const p = pending as Pending | null
      if (p) {
        for (const uid of p.mentionRecipients) {
          await sendMentionEmail({
            recipientId: uid,
            actorId: ctx.auth.userId,
            conversationId: p.conversationId,
            itemId: p.itemId,
            bodyMd: p.bodyMd
          })
        }
        for (const uid of p.dmRecipients) {
          await sendDmEmail({
            recipientId: uid,
            actorId: ctx.auth.userId,
            conversationId: p.conversationId,
            itemId: p.itemId,
            bodyMd: p.bodyMd
          })
        }
      }

      return textResult(`Posted item ${result.item_id}`, result)
    }
    catch (err) {
      return mcpError(err)
    }
  }
})

export const postCommentTool = defineMcpTool({
  name: 'messages_post_comment',
  description: 'Post a markdown comment on an item. `parent_comment_id` may only reference a top-level comment.',
  scope: 'messages.write',
  input: z.object({
    item_id: z.string().uuid(),
    body_md: z.string().min(1).max(MAX_COMMENT_BODY_BYTES),
    parent_comment_id: z.string().uuid().nullable().optional(),
    anchor: z
      .object({
        quote: z.string().min(1).max(2000),
        prefix: z.string().max(200),
        suffix: z.string().max(200),
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative()
      })
      .optional()
  }).strict(),
  handler: async (input, ctx) => {
    try {
      type Pending = {
        mentionRecipients: string[]
        commentId: string
        bodyMd: string
        conversationId: string
        itemId: string
      }
      let pending: Pending | null = null

      const result = await runInOrgTransaction(ctx.event, async (tx) => {
        const orgId = getOrgId(ctx)
        const item = await tx
          .selectFrom('messages_items')
          .select(['id', 'conversation_id', 'author_id', 'deleted_at', 'kind'])
          .where('id', '=', input.item_id)
          .executeTakeFirst()
        if (!item || item.deleted_at) {
          throw createError({ statusCode: 404, statusMessage: 'Item not found.' })
        }
        const conv = await requireConversationAccess(tx, ctx.auth.userId, item.conversation_id)
        const bodyMd = await validateMcpMarkdown(tx, input.body_md, {
          orgId,
          maxBytes: MAX_COMMENT_BODY_BYTES
        })

        let parentId: string | null = null
        if (input.parent_comment_id) {
          const parent = await tx
            .selectFrom('messages_comments')
            .select(['id', 'parent_comment_id', 'item_id'])
            .where('id', '=', input.parent_comment_id)
            .executeTakeFirst()
          if (!parent || parent.item_id !== item.id) {
            throw createError({ statusCode: 400, statusMessage: 'Parent comment not found on this item.' })
          }
          if (parent.parent_comment_id !== null) {
            throw createError({ statusCode: 400, statusMessage: 'Replies can only target top-level comments.' })
          }
          parentId = parent.id
        }

        let anchor = input.anchor ?? null
        if (anchor && parentId) anchor = null
        if (anchor && item.kind !== 'markdown') anchor = null

        const inserted = await tx
          .insertInto('messages_comments')
          .values({
            item_id: item.id,
            author_id: ctx.auth.userId,
            parent_comment_id: parentId,
            body_md: bodyMd,
            anchor: anchor as Record<string, unknown> | null
          })
          .returning(['id', 'created_at'])
          .executeTakeFirstOrThrow()

        const dmMemberIds = conv.kind === 'dm' ? await getDmMemberIds(tx, conv.id) : null
        const mentions = extractMentions(bodyMd)
        const mentionResult = await fanoutMentions(tx, mentions, {
          orgId,
          authorId: ctx.auth.userId,
          conversationId: conv.id,
          commentId: inserted.id,
          dmMemberIds
        })
        const mentionedSet = new Set(mentionResult.notified)

        const priorCommenterRows = await tx
          .selectFrom('messages_comments')
          .select('author_id')
          .where('item_id', '=', item.id)
          .where('id', '!=', inserted.id)
          .execute()

        const recipients = new Set<string>()
        if (item.author_id !== ctx.auth.userId) recipients.add(item.author_id)
        for (const r of priorCommenterRows) {
          if (r.author_id !== ctx.auth.userId) recipients.add(r.author_id)
        }
        for (const id of mentionedSet) recipients.delete(id)

        if (recipients.size > 0) {
          await createNotifications(
            tx,
            [...recipients].map(uid => ({
              user_id: uid,
              kind: parentId ? ('reply' as const) : ('comment' as const),
              item_id: item.id,
              comment_id: inserted.id,
              conversation_id: conv.id,
              actor_id: ctx.auth.userId
            })),
            { perEventEmail: false }
          )
        }

        await mcpLog('CREATE', 'messages_comments', inserted.id, ctx, {
          item_id: item.id,
          conversation_id: conv.id,
          parent_comment_id: parentId
        }, asAuditExecutor(tx))

        pending = {
          mentionRecipients: mentionResult.notified,
          commentId: inserted.id,
          bodyMd,
          conversationId: conv.id,
          itemId: item.id
        }

        return {
          comment_id: inserted.id,
          created_at: (inserted.created_at as Date).toISOString()
        }
      })

      const p = pending as Pending | null
      if (p) {
        for (const uid of p.mentionRecipients) {
          await sendMentionEmail({
            recipientId: uid,
            actorId: ctx.auth.userId,
            conversationId: p.conversationId,
            itemId: p.itemId,
            commentId: p.commentId,
            bodyMd: p.bodyMd
          })
        }
      }

      return textResult(`Posted comment ${result.comment_id}`, result)
    }
    catch (err) {
      return mcpError(err)
    }
  }
})

export const reactTool = defineMcpTool({
  name: 'messages_react',
  description: 'Add a reaction emoji to an item or comment.',
  scope: 'messages.write',
  input: z.object({
    target_kind: z.enum(['item', 'comment']),
    target_id: z.string().uuid(),
    emoji: z.string().min(1).max(64)
  }).strict(),
  handler: async (input, ctx) => {
    try {
      const result = await runInOrgTransaction(ctx.event, async (tx) => {
        // Resolve the conversation of the target so we can do an access check.
        let conversationId: string | null = null
        if (input.target_kind === 'item') {
          const row = await tx
            .selectFrom('messages_items')
            .select(['id', 'conversation_id', 'deleted_at'])
            .where('id', '=', input.target_id)
            .executeTakeFirst()
          if (!row || row.deleted_at) {
            throw createError({ statusCode: 404, statusMessage: 'Item not found.' })
          }
          conversationId = row.conversation_id
        } else {
          const row = await tx
            .selectFrom('messages_comments as c')
            .innerJoin('messages_items as i', 'i.id', 'c.item_id')
            .select(['c.id', 'i.conversation_id', 'c.deleted_at'])
            .where('c.id', '=', input.target_id)
            .executeTakeFirst()
          if (!row || row.deleted_at) {
            throw createError({ statusCode: 404, statusMessage: 'Comment not found.' })
          }
          conversationId = row.conversation_id
        }

        await requireConversationAccess(tx, ctx.auth.userId, conversationId!)

        await tx
          .insertInto('messages_reactions')
          .values({
            target_kind: input.target_kind,
            target_id: input.target_id,
            user_id: ctx.auth.userId,
            emoji: input.emoji
          })
          .onConflict(oc => oc.doNothing())
          .execute()

        await mcpLog('CREATE', 'messages_reactions', input.target_id, ctx, {
          target_kind: input.target_kind,
          emoji: input.emoji
        }, asAuditExecutor(tx))

        return { ok: true as const }
      })

      return textResult('Reaction added.', result)
    }
    catch (err) {
      return mcpError(err)
    }
  }
})

export const markReadTool = defineMcpTool({
  name: 'messages_mark_read',
  description: 'Mark a conversation as read (UPSERT messages_conversation_reads.last_read_at) or mark notification IDs as read.',
  scope: 'messages.write',
  input: z.union([
    z.object({ conversation_id: z.string().uuid() }).strict(),
    z.object({ notification_ids: z.array(z.string().uuid()).min(1).max(100) }).strict()
  ]),
  handler: async (input, ctx) => {
    try {
      const result = await runInOrgTransaction(ctx.event, async (tx) => {
        if ('conversation_id' in input) {
          const conv = await loadConversation(tx, input.conversation_id)
          if (!conv) {
            throw createError({ statusCode: 404, statusMessage: 'Conversation not found.' })
          }
          await tx
            .insertInto('messages_conversation_reads')
            .values({
              user_id: ctx.auth.userId,
              conversation_id: input.conversation_id,
              last_read_at: sql<Date>`now()`
            })
            .onConflict(oc => oc
              .columns(['user_id', 'conversation_id'])
              .doUpdateSet({ last_read_at: sql<Date>`now()` }))
            .execute()
          await mcpLog('UPDATE', 'messages_conversation_reads', input.conversation_id, ctx, {
            mark: 'conversation'
          }, asAuditExecutor(tx))
          return { marked: 'conversation' as const, conversation_id: input.conversation_id }
        }

        await tx
          .updateTable('messages_notifications')
          .set({ read_at: sql<Date>`now()` })
          .where('user_id', '=', ctx.auth.userId)
          .where('id', 'in', input.notification_ids)
          .execute()
        await mcpLog('UPDATE', 'messages_notifications', input.notification_ids[0]!, ctx, {
          mark: 'notifications',
          count: input.notification_ids.length
        }, asAuditExecutor(tx))
        return {
          marked: 'notifications' as const,
          count: input.notification_ids.length
        }
      })

      return textResult(
        result.marked === 'conversation'
          ? `Conversation ${result.conversation_id} marked read.`
          : `${result.count} notification(s) marked read.`,
        result
      )
    }
    catch (err) {
      return mcpError(err)
    }
  }
})

export const messagesMcpTools = [
  listConversationsTool,
  listItemsTool,
  readItemTool,
  searchTool,
  listNotificationsTool,
  postItemTool,
  postCommentTool,
  reactTool,
  markReadTool
]
