// Per-user preferences. Defaults live here; gmail_user_prefs holds only the
// keys a user explicitly changed, and a value set back to its default is
// removed rather than stored.
import { sql, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'

export interface GmailPrefs {
  // Seconds a queued send waits before the sweep picks it up (the undo window).
  undoSendSeconds: number
}

export const GMAIL_PREF_DEFAULTS: GmailPrefs = {
  undoSendSeconds: 10
}

export const GMAIL_PREF_LIMITS = {
  undoSendSeconds: { min: 0, max: 60 }
}

function sanitize(raw: Record<string, unknown> | null | undefined): Partial<GmailPrefs> {
  const out: Partial<GmailPrefs> = {}
  if (!raw) return out
  const undo = Number(raw.undoSendSeconds)
  if (Number.isFinite(undo)) {
    out.undoSendSeconds = Math.min(GMAIL_PREF_LIMITS.undoSendSeconds.max, Math.max(GMAIL_PREF_LIMITS.undoSendSeconds.min, Math.round(undo)))
  }
  return out
}

export async function gmailGetPrefs(tx: Transaction<Database>, userId: string): Promise<GmailPrefs> {
  const row = await tx.selectFrom('gmail_user_prefs').select('prefs').where('user_id', '=', userId).executeTakeFirst()
  return { ...GMAIL_PREF_DEFAULTS, ...sanitize(row?.prefs) }
}

export async function gmailSetPrefs(tx: Transaction<Database>, userId: string, patch: Partial<GmailPrefs>): Promise<GmailPrefs> {
  const row = await tx.selectFrom('gmail_user_prefs').select('prefs').where('user_id', '=', userId).executeTakeFirst()
  const merged: Record<string, unknown> = { ...sanitize(row?.prefs), ...sanitize(patch as Record<string, unknown>) }
  const overrides = Object.fromEntries(
    Object.entries(merged).filter(([key, value]) => value !== GMAIL_PREF_DEFAULTS[key as keyof GmailPrefs])
  )
  await tx
    .insertInto('gmail_user_prefs')
    .values({ user_id: userId, prefs: sql`${JSON.stringify(overrides)}::text::jsonb`, updated_at: new Date() })
    .onConflict(oc => oc.column('user_id').doUpdateSet({ prefs: sql`${JSON.stringify(overrides)}::text::jsonb`, updated_at: new Date() }))
    .execute()
  return { ...GMAIL_PREF_DEFAULTS, ...sanitize(overrides) }
}
