import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import type { SeedContext } from '../../../core/seeds/types'
import type {
  MessagesConversationsTable,
  MessagesConversationMembersTable,
  MessagesItemsTable
} from '../server/database/schema'

// Untyped pass-through: tenancy mode adds an `org_id` column at runtime
// that isn't reflected in this layer's compile-time schema, so we widen
// the columns to `any` here and rely on the runtime DEFAULT to fill it
// (via the `app.current_org` GUC set inside the transaction).
type MessagesDb = {
  messages_conversations: MessagesConversationsTable & { org_id?: string }
  messages_conversation_members: MessagesConversationMembersTable & { org_id?: string }
  messages_items: MessagesItemsTable & { org_id?: string }
}

interface ChannelSeed {
  name: string
  description: string
  posts: Array<{ author: 'admin@example.com' | 'alice@example.com' | 'bob@example.com' | 'carol@example.com', body: string }>
}

const CHANNELS: ChannelSeed[] = [
  {
    name: 'general',
    description: 'Company-wide announcements and chatter.',
    posts: [
      { author: 'admin@example.com', body: 'Welcome to the demo workspace! :wave:' },
      { author: 'alice@example.com', body: 'Hello everyone — excited to be here.' }
    ]
  },
  {
    name: 'announcements',
    description: 'Important updates from the team.',
    posts: [
      { author: 'admin@example.com', body: 'This is where official announcements go.' }
    ]
  },
  {
    name: 'random',
    description: 'Off-topic, gifs, and shower thoughts.',
    posts: [
      { author: 'bob@example.com', body: 'Anyone else think this seed data is suspiciously chipper?' }
    ]
  }
]

async function seedChannels(
  db: Kysely<MessagesDb>,
  users: SeedContext['users'],
  log: SeedContext['log']
): Promise<void> {
  const adminId = users.find(u => u.isAdmin)?.id
  if (!adminId) {
    log('messages: no admin user, skipping')
    return
  }
  const userByEmail = new Map(users.map(u => [u.email, u]))

  for (const ch of CHANNELS) {
    const existing = await db
      .selectFrom('messages_conversations')
      .select('id')
      .where('kind', '=', 'channel')
      .where('name', '=', ch.name)
      .executeTakeFirst()

    if (existing) {
      log(`channel (exists): #${ch.name}`)
      continue
    }

    const inserted = await db
      .insertInto('messages_conversations')
      .values({
        kind: 'channel',
        name: ch.name,
        description: ch.description,
        created_by: adminId
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    for (const u of users) {
      await db.insertInto('messages_conversation_members').values({
        conversation_id: inserted.id,
        user_id: u.id,
        role: u.isAdmin ? 'owner' : 'member'
      }).execute()
    }

    for (const p of ch.posts) {
      const author = userByEmail.get(p.author)
      if (!author) continue
      await db.insertInto('messages_items').values({
        conversation_id: inserted.id,
        author_id: author.id,
        kind: 'markdown',
        body_md: p.body,
        storage_key: null,
        filename: null,
        mime: null,
        size_bytes: null
      }).execute()
    }

    log(`channel (new):    #${ch.name} (${ch.posts.length} posts)`)
  }
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const db = ctx.db as Kysely<MessagesDb>

  // Multi-tenant mode: every messages_* table is org-scoped via NOT NULL
  // org_id DEFAULT current_org_id(). Mirror the runtime pattern from
  // defineTenantHandler — open a transaction, SET LOCAL the GUC, run the
  // inserts so the column DEFAULT resolves to the demo org. Single-tenant
  // mode skips the SET LOCAL because the column doesn't exist.
  await db.transaction().execute(async (tx) => {
    if (ctx.orgId) {
      await sql`SET LOCAL app.current_org = ${sql.lit(ctx.orgId)}`.execute(tx)
    }
    await seedChannels(tx as unknown as Kysely<MessagesDb>, ctx.users, ctx.log)
  })
}
