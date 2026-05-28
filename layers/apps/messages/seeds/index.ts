import { sql } from 'kysely'
import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { SeedContext } from '#core/seeds/types'
import type {
  MessagesConversationsTable,
  MessagesConversationMembersTable,
  MessagesItemsTable
} from '../server/database/schema'
import type { NotificationsTable } from '#core/server/database/schema'

// Untyped pass-through: tenancy mode adds an `org_id` column at runtime
// that isn't reflected in this layer's compile-time schema, so we widen
// the columns to `any` here and rely on the runtime DEFAULT to fill it
// (via the `app.current_org` GUC set inside the transaction).
type MessagesDb = {
  messages_conversations: MessagesConversationsTable & { org_id?: string }
  messages_conversation_members: MessagesConversationMembersTable & { org_id?: string }
  messages_items: MessagesItemsTable & { org_id?: string }
  notifications: NotificationsTable & { org_id?: string }
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

// Ensure each demo channel exists (with members + posts on first creation) and
// return a name → conversation id map for downstream notification links.
async function ensureChannels(
  db: Kysely<MessagesDb>,
  users: SeedContext['users'],
  log: SeedContext['log']
): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  const adminId = users.find(u => u.isAdmin)?.id
  if (!adminId) {
    log('messages: no admin user, skipping channels')
    return ids
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
      ids.set(ch.name, existing.id)
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
    ids.set(ch.name, inserted.id)

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

  return ids
}

// Ensure a 1:1 DM between two users exists, with a couple of messages. Returns
// the conversation id (or null if either user is missing).
async function ensureDm(
  db: Kysely<MessagesDb>,
  a: SeedContext['users'][number] | undefined,
  b: SeedContext['users'][number] | undefined,
  messages: Array<{ from: 'a' | 'b', body: string }>,
  log: SeedContext['log']
): Promise<string | null> {
  if (!a || !b) return null
  const [lo, hi] = [a.id, b.id].sort() as [string, string]

  const existing = await db
    .selectFrom('messages_conversations')
    .select('id')
    .where('kind', '=', 'dm')
    .where('dm_pair_lo', '=', lo)
    .where('dm_pair_hi', '=', hi)
    .executeTakeFirst()
  if (existing) {
    log(`dm (exists): ${a.email} ↔ ${b.email}`)
    return existing.id
  }

  const inserted = await db
    .insertInto('messages_conversations')
    .values({
      kind: 'dm',
      name: null,
      description: null,
      created_by: a.id,
      dm_pair_lo: lo,
      dm_pair_hi: hi
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  await db.insertInto('messages_conversation_members').values([
    { conversation_id: inserted.id, user_id: lo, role: 'member' },
    { conversation_id: inserted.id, user_id: hi, role: 'member' }
  ]).execute()

  for (const m of messages) {
    const author = m.from === 'a' ? a : b
    await db.insertInto('messages_items').values({
      conversation_id: inserted.id,
      author_id: author.id,
      kind: 'markdown',
      body_md: m.body,
      storage_key: null,
      filename: null,
      mime: null,
      size_bytes: null
    }).execute()
  }

  log(`dm (new):    ${a.email} ↔ ${b.email} (${messages.length} messages)`)
  return inserted.id
}

// Seed a handful of global notifications for the admin (the primary demo
// login), so the bell + per-app rail badge show data on first run. Idempotent:
// skips entirely if the admin already has any messages notifications.
async function seedNotifications(
  db: Kysely<MessagesDb>,
  users: SeedContext['users'],
  channelIds: Map<string, string>,
  dmId: string | null,
  log: SeedContext['log']
): Promise<void> {
  const admin = users.find(u => u.isAdmin)
  if (!admin) return

  const existing = await db
    .selectFrom('notifications')
    .select('id')
    .where('user_id', '=', admin.id)
    .where('app_id', '=', 'messages')
    .executeTakeFirst()
  if (existing) {
    log('notifications (exist): skipping')
    return
  }

  const alice = users.find(u => u.email === 'alice@example.com')
  const bob = users.find(u => u.email === 'bob@example.com')
  const carol = users.find(u => u.email === 'carol@example.com')
  const general = channelIds.get('general')
  const announcements = channelIds.get('announcements')

  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

  type Row = {
    actor: SeedContext['users'][number] | undefined
    title: string
    body: string | null
    icon: string
    link: string | null
    email_mode: 'immediate' | 'digest' | 'none'
    minutes: number
    read?: boolean
  }

  const rows: Row[] = [
    {
      actor: alice,
      title: 'Alice mentioned you in #general',
      body: 'hey @Admin can you take a look at the launch checklist?',
      icon: 'i-lucide-at-sign',
      link: general ? `/messages/${general}` : null,
      email_mode: 'immediate',
      minutes: 2
    },
    {
      actor: bob,
      title: 'Bob sent you a message',
      body: 'ping me when you have a sec about the demo',
      icon: 'i-lucide-mail',
      link: dmId ? `/messages/${dmId}` : null,
      email_mode: 'immediate',
      minutes: 18
    },
    {
      actor: carol,
      title: 'Carol commented on a thread',
      body: 'left a couple of notes on the proposal',
      icon: 'i-lucide-message-circle',
      link: general ? `/messages/${general}` : null,
      email_mode: 'digest',
      minutes: 90
    },
    {
      actor: alice,
      title: 'Alice replied to a thread',
      body: 'sounds good — shipping it today',
      icon: 'i-lucide-message-circle',
      link: announcements ? `/messages/${announcements}` : null,
      email_mode: 'digest',
      minutes: 60 * 26,
      read: true
    }
  ]

  let n = 0
  for (const r of rows) {
    if (!r.link) continue
    await db.insertInto('notifications').values({
      id: randomUUID(),
      user_id: admin.id,
      app_id: 'messages',
      title: r.title,
      body: r.body,
      icon: r.icon,
      link: r.link,
      actor_id: r.actor?.id ?? null,
      email_mode: r.email_mode,
      // Demo rows shouldn't trigger real emails — stamp them as already sent.
      emailed_at: sql<Date>`now()`,
      created_at: minutesAgo(r.minutes),
      read_at: r.read ? minutesAgo(r.minutes - 1) : null
    }).execute()
    n++
  }
  log(`notifications (new): ${n} for ${admin.email}`)
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const db = ctx.db as Kysely<MessagesDb>

  // Multi-tenant mode: every messages_* + notifications row is org-scoped via
  // NOT NULL org_id DEFAULT current_org_id(). Mirror the runtime pattern from
  // defineTenantHandler — open a transaction, SET LOCAL the GUC, run the
  // inserts so the column DEFAULT resolves to the demo org. Single-tenant mode
  // skips the SET LOCAL because the column doesn't exist.
  await db.transaction().execute(async (tx) => {
    const t = tx as unknown as Kysely<MessagesDb>
    if (ctx.orgId) {
      await sql`SET LOCAL app.current_org = ${sql.lit(ctx.orgId)}`.execute(tx)
    }
    const channelIds = await ensureChannels(t, ctx.users, ctx.log)

    const admin = ctx.users.find(u => u.isAdmin)
    const alice = ctx.users.find(u => u.email === 'alice@example.com')
    const dmId = await ensureDm(
      t,
      admin,
      alice,
      [
        { from: 'b', body: 'hey, do you have the slides for tomorrow?' },
        { from: 'a', body: 'yep — sending them over now' }
      ],
      ctx.log
    )

    await seedNotifications(t, ctx.users, channelIds, dmId, ctx.log)
  })
}
