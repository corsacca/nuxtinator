import { type Kysely, sql } from 'kysely'

// Channel digest subscriptions move from a presence model (row = subscribed)
// to an explicit-state model so an opt-out can be remembered. A row now means
// "the user has a stated preference for this channel"; the `subscribed` flag
// says which way. No row means "never touched" — eligible for auto-subscribe
// the first time the user opens the channel. Existing rows all meant
// "subscribed", so they default to true.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('messages_channel_subscriptions')
    .addColumn('subscribed', 'boolean', col => col.notNull().defaultTo(true))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop opt-out rows first — in the presence model they shouldn't exist.
  await sql`DELETE FROM messages_channel_subscriptions WHERE subscribed = false`.execute(db)
  await db.schema
    .alterTable('messages_channel_subscriptions')
    .dropColumn('subscribed')
    .execute()
}
