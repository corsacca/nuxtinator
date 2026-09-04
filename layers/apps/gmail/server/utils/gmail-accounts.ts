// Connected-account lifecycle: verify credentials against Gmail, discover
// the special-use folders, store the app password encrypted, and expose
// the API view. Every query is scoped by the owning user.
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import { decryptSecret, encryptSecret } from '#core/server/utils/secret-crypto'
import type { GmailAccountsTable, GmailFolderPaths, GmailSyncState } from '../database/schema'
import type { GmailCredentials, GmailFolderInfo } from './gmail-transport'
import { gmailGetTransport } from './gmail-transport-registry'
import { gmailJson } from './gmail-json'

type Db = Kysely<Database> | Transaction<Database>
export type GmailAccountRow = Selectable<GmailAccountsTable>

export const GMAIL_ACCOUNT_STATUSES = ['connecting', 'active', 'error'] as const

export class GmailSetupError extends Error {
  constructor(public readonly code: 'auth' | 'folders' | 'connect', message: string) {
    super(message)
    this.name = 'GmailSetupError'
  }
}

const SPECIAL = { all: '\\All', trash: '\\Trash', spam: '\\Junk', sent: '\\Sent', drafts: '\\Drafts' } as const

export function gmailResolveFolders(folders: GmailFolderInfo[]): { paths: GmailFolderPaths | null, missing: string[] } {
  const find = (use: string) => folders.find(f => f.specialUse === use)?.path ?? null
  const all = find(SPECIAL.all)
  const trash = find(SPECIAL.trash)
  const spam = find(SPECIAL.spam)
  const missing: string[] = []
  if (!all) missing.push('All Mail')
  if (!trash) missing.push('Trash')
  if (!spam) missing.push('Spam')
  if (missing.length || !all || !trash || !spam) return { paths: null, missing }
  return { paths: { all, trash, spam, sent: find(SPECIAL.sent), drafts: find(SPECIAL.drafts) }, missing }
}

// Logs in, lists folders, logs out. Throws GmailSetupError with a message
// the settings page can show verbatim.
export async function gmailDiscover(creds: GmailCredentials): Promise<{ paths: GmailFolderPaths, folders: GmailFolderInfo[] }> {
  const transport = gmailGetTransport()
  let session
  try {
    session = await transport.connect(creds)
  } catch (err) {
    if ((err as Error)?.name === 'GmailAuthError') {
      throw new GmailSetupError('auth', 'Gmail rejected the address or app password. App passwords need 2-Step Verification turned on for the Google account.')
    }
    throw new GmailSetupError('connect', `Could not reach Gmail: ${(err as Error)?.message ?? 'unknown error'}`)
  }
  let folders: GmailFolderInfo[]
  try {
    folders = await session.listFolders()
  } finally {
    await session.close()
  }
  const { paths, missing } = gmailResolveFolders(folders)
  if (!paths) {
    throw new GmailSetupError('folders', `Gmail is hiding ${missing.join(', ')} from IMAP. In Gmail, open Settings → Labels and tick "Show in IMAP" for ${missing.join(' and ')}, then try again.`)
  }
  return { paths, folders }
}

export function gmailNormalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function gmailCreateAccount(
  tx: Transaction<Database>,
  userId: string,
  input: { email: string, password: string, displayName?: string | null }
): Promise<GmailAccountRow> {
  const email = gmailNormalizeEmail(input.email)
  const existing = await tx
    .selectFrom('gmail_accounts')
    .select('id')
    .where('user_id', '=', userId)
    .where('email', '=', email)
    .executeTakeFirst()
  if (existing) throw new GmailSetupError('auth', 'That Gmail address is already connected.')

  const { paths, folders } = await gmailDiscover({ email, password: input.password })
  const row = await tx
    .insertInto('gmail_accounts')
    .values({
      user_id: userId,
      email,
      display_name: input.displayName?.trim() || null,
      app_password_enc: encryptSecret(input.password),
      status: 'connecting',
      folders: gmailJson<GmailFolderPaths>(paths),
      sync_state: gmailJson<GmailSyncState>({}),
      created_at: new Date(),
      updated_at: new Date()
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  await gmailUpsertLabels(tx, row.id, folders)
  return row
}

export async function gmailUpdateAccountCredentials(tx: Transaction<Database>, userId: string, id: string, password: string): Promise<GmailAccountRow> {
  const account = await gmailGetAccount(tx, userId, id)
  if (!account) throw new GmailSetupError('auth', 'Account not found.')
  const { paths, folders } = await gmailDiscover({ email: account.email, password })
  const row = await tx
    .updateTable('gmail_accounts')
    .set({
      app_password_enc: encryptSecret(password),
      folders: gmailJson<GmailFolderPaths>(paths),
      status: 'connecting',
      last_error: null,
      updated_at: new Date()
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow()
  await gmailUpsertLabels(tx, id, folders)
  return row
}

export async function gmailUpdateAccountProfile(
  tx: Transaction<Database>,
  userId: string,
  id: string,
  patch: { displayName?: string | null, signatureHtml?: string | null }
): Promise<GmailAccountRow | null> {
  const set: Record<string, unknown> = { updated_at: new Date() }
  if (patch.displayName !== undefined) set.display_name = patch.displayName?.trim() || null
  if (patch.signatureHtml !== undefined) set.signature_html = patch.signatureHtml?.trim() || null
  return await tx
    .updateTable('gmail_accounts')
    .set(set)
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .returningAll()
    .executeTakeFirst() ?? null
}

export async function gmailListAccounts(db: Db, userId: string): Promise<GmailAccountRow[]> {
  return await db.selectFrom('gmail_accounts').selectAll().where('user_id', '=', userId).orderBy('created_at', 'asc').execute()
}

export async function gmailGetAccount(db: Db, userId: string, id: string): Promise<GmailAccountRow | null> {
  return await db.selectFrom('gmail_accounts').selectAll().where('id', '=', id).where('user_id', '=', userId).executeTakeFirst() ?? null
}

export async function gmailGetAccountById(db: Db, id: string): Promise<GmailAccountRow | null> {
  return await db.selectFrom('gmail_accounts').selectAll().where('id', '=', id).executeTakeFirst() ?? null
}

export async function gmailDeleteAccount(tx: Transaction<Database>, userId: string, id: string): Promise<boolean> {
  const res = await tx.deleteFrom('gmail_accounts').where('id', '=', id).where('user_id', '=', userId).executeTakeFirst()
  return Number(res.numDeletedRows) > 0
}

export function gmailAccountCreds(row: Pick<GmailAccountRow, 'email' | 'app_password_enc'>): GmailCredentials {
  return { email: row.email, password: decryptSecret(row.app_password_enc) }
}

export async function gmailSetAccountState(
  db: Db,
  id: string,
  patch: { status?: string, lastError?: string | null, syncState?: GmailSyncState, backfillDone?: boolean, lastSyncAt?: Date }
): Promise<void> {
  const set: Record<string, unknown> = { updated_at: new Date() }
  if (patch.status !== undefined) set.status = patch.status
  if (patch.lastError !== undefined) set.last_error = patch.lastError
  if (patch.syncState !== undefined) set.sync_state = gmailJson<GmailSyncState>(patch.syncState)
  if (patch.backfillDone !== undefined) set.backfill_done = patch.backfillDone
  if (patch.lastSyncAt !== undefined) set.last_sync_at = patch.lastSyncAt
  await db.updateTable('gmail_accounts').set(set).where('id', '=', id).execute()
}

// Session lease: the caller becomes (or stays) the owner if the lease is
// free, expired, or already theirs. Returns false when another process holds it.
export async function gmailClaimLease(db: Db, id: string, holder: string, ttlSeconds: number): Promise<boolean> {
  const res = await db
    .updateTable('gmail_accounts')
    .set({ lease_holder: holder, lease_expires_at: sql`now() + make_interval(secs => ${ttlSeconds})` })
    .where('id', '=', id)
    .where(eb => eb.or([
      eb('lease_holder', 'is', null),
      eb('lease_holder', '=', holder),
      eb('lease_expires_at', '<', sql<Date>`now()`)
    ]))
    .executeTakeFirst()
  return Number(res.numUpdatedRows) > 0
}

export async function gmailReleaseLease(db: Db, id: string, holder: string): Promise<void> {
  await db
    .updateTable('gmail_accounts')
    .set({ lease_holder: null, lease_expires_at: null })
    .where('id', '=', id)
    .where('lease_holder', '=', holder)
    .execute()
}

// Mirrors the IMAP folder list into gmail_labels. INBOX and the special-use
// folders are kept (with their attribute) so the UI can tell them apart from
// user labels.
export async function gmailUpsertLabels(db: Db, accountId: string, folders: GmailFolderInfo[]): Promise<void> {
  const paths = folders.map(f => f.path)
  if (paths.length) {
    await db.deleteFrom('gmail_labels').where('account_id', '=', accountId).where('path', 'not in', paths).execute()
  } else {
    await db.deleteFrom('gmail_labels').where('account_id', '=', accountId).execute()
    return
  }
  await db
    .insertInto('gmail_labels')
    .values(folders.map(f => ({ account_id: accountId, path: f.path, name: f.name, special_use: f.specialUse, created_at: new Date() })))
    .onConflict(oc => oc.columns(['account_id', 'path']).doUpdateSet({ name: sql`excluded.name`, special_use: sql`excluded.special_use` }))
    .execute()
}

export interface GmailLabelView {
  id: string
  accountId: string
  path: string
  name: string
}

// User-created labels only (no INBOX, no [Gmail]/* system folders).
export async function gmailListUserLabels(db: Db, accountIds: string[]): Promise<GmailLabelView[]> {
  if (!accountIds.length) return []
  const rows = await db
    .selectFrom('gmail_labels')
    .select(['id', 'account_id', 'path', 'name'])
    .where('account_id', 'in', accountIds)
    .where('special_use', 'is', null)
    .where('path', '!=', 'INBOX')
    .where('path', 'not like', '[Gmail]%')
    .orderBy('path', 'asc')
    .execute()
  return rows.map(r => ({ id: r.id, accountId: r.account_id, path: r.path, name: r.name }))
}

export interface GmailAccountView {
  id: string
  email: string
  displayName: string | null
  signatureHtml: string | null
  status: string
  lastError: string | null
  backfillDone: boolean
  lastSyncAt: string | null
  createdAt: string
}

export function gmailAccountView(row: GmailAccountRow): GmailAccountView {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    signatureHtml: row.signature_html,
    status: row.status,
    lastError: row.last_error,
    backfillDone: row.backfill_done,
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString()
  }
}
