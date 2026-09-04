// Compose autocomplete source: every address seen in a mirrored header,
// counted per user so frequent correspondents rank first.
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { GmailAddressLike } from './gmail-transport'

type Db = Kysely<Database> | Transaction<Database>

export async function gmailRecordAddresses(db: Db, userId: string, addrs: GmailAddressLike[]): Promise<void> {
  const seen = new Map<string, string | null>()
  for (const a of addrs) {
    const email = a.address.trim().toLowerCase()
    if (!email.includes('@') || email.length > 320) continue
    if (!seen.has(email) || (!seen.get(email) && a.name)) seen.set(email, a.name?.trim() || null)
  }
  if (!seen.size) return
  const values = [...seen.entries()].map(([email, name]) => ({ user_id: userId, email, name, seen_count: 1, last_seen_at: new Date() }))
  await db
    .insertInto('gmail_addresses')
    .values(values)
    .onConflict(oc => oc.columns(['user_id', 'email']).doUpdateSet({
      seen_count: sql`gmail_addresses.seen_count + 1`,
      name: sql`coalesce(excluded.name, gmail_addresses.name)`,
      last_seen_at: new Date()
    }))
    .execute()
}

export async function gmailSearchAddresses(db: Db, userId: string, q: string, limit = 8): Promise<{ email: string, name: string | null }[]> {
  const needle = `%${q.trim().toLowerCase()}%`
  const rows = await db
    .selectFrom('gmail_addresses')
    .select(['email', 'name'])
    .where('user_id', '=', userId)
    .where(eb => eb.or([eb('email', 'like', needle), eb(sql`lower(coalesce(name, ''))`, 'like', needle)]))
    .orderBy('seen_count', 'desc')
    .orderBy('last_seen_at', 'desc')
    .limit(limit)
    .execute()
  return rows
}
