// Module augmentation: extends the host's Database interface with messages tables.
import type { ColumnType, Generated } from 'kysely'

export type ConversationKind = 'channel' | 'dm'
export type ItemKind = 'markdown' | 'image' | 'file'
export type NotificationKind = 'mention' | 'dm' | 'comment' | 'reply'
export type ReactionTargetKind = 'item' | 'comment'

export interface MessagesConversationsTable {
  id: Generated<string>
  kind: ConversationKind
  name: string | null
  description: string | null
  created_by: string
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  archived_at: ColumnType<Date | null, Date | string | null, Date | string | null>
  dm_pair_lo: string | null
  dm_pair_hi: string | null
}

export interface MessagesConversationMembersTable {
  conversation_id: string
  user_id: string
  role: Generated<string>
  joined_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface MessagesChannelSubscriptionsTable {
  channel_id: string
  user_id: string
  subscribed_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface MessagesConversationReadsTable {
  user_id: string
  conversation_id: string
  last_read_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface MessagesItemsTable {
  id: Generated<string>
  conversation_id: string
  author_id: string
  kind: ItemKind
  body_md: string | null
  storage_key: string | null
  filename: string | null
  mime: string | null
  size_bytes: ColumnType<string | null, string | number | null | undefined, string | number | null>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  edited_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  deleted_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
}

export interface MessagesCommentsTable {
  id: Generated<string>
  item_id: string
  author_id: string
  parent_comment_id: string | null
  body_md: string
  anchor: AnchorPayload | null
  anchor_orphaned: Generated<boolean>
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  edited_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  deleted_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  resolved_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  resolved_by: string | null
}

export interface AnchorPayload {
  quote: string
  prefix: string
  suffix: string
  start: number
  end: number
}

export interface MessagesReactionsTable {
  id: Generated<string>
  target_kind: ReactionTargetKind
  target_id: string
  user_id: string
  emoji: string
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface MessagesUserTagsTable {
  user_id: string
  tag_name: string
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface MessagesItemTagsTable {
  user_id: string
  item_id: string
  tag_name: string
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface MessagesItemStarsTable {
  user_id: string
  item_id: string
  starred_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface MessagesMentionsTable {
  id: Generated<string>
  item_id: string | null
  comment_id: string | null
  mentioned_user_id: string
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface MessagesNotificationsTable {
  id: Generated<string>
  user_id: string
  kind: NotificationKind
  item_id: string | null
  comment_id: string | null
  conversation_id: string | null
  actor_id: string | null
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
  read_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
  emailed_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>
}

declare module '~/server/database/schema' {
  interface Database {
    messages_conversations: MessagesConversationsTable
    messages_conversation_members: MessagesConversationMembersTable
    messages_channel_subscriptions: MessagesChannelSubscriptionsTable
    messages_conversation_reads: MessagesConversationReadsTable
    messages_items: MessagesItemsTable
    messages_comments: MessagesCommentsTable
    messages_reactions: MessagesReactionsTable
    messages_user_tags: MessagesUserTagsTable
    messages_item_tags: MessagesItemTagsTable
    messages_item_stars: MessagesItemStarsTable
    messages_mentions: MessagesMentionsTable
    messages_notifications: MessagesNotificationsTable
  }
}
