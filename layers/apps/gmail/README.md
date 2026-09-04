# @nuxtinator/gmail

A personal, multi-account Gmail client. Each user connects their own Gmail
accounts with a Google app password; mail is mirrored into Postgres over IMAP,
triaged from a unified inbox, snoozed locally, and sent over SMTP.

No Google OAuth, no Cloud project, no verification: the only Google-side setup
is an app password per account.

## Features

- **Accounts**: any number per user, shared across every org the user belongs
  to (the tables are user-keyed, not org-keyed). Credentials are verified and
  the special-use folders discovered before anything is stored; the app
  password is AES-256-GCM encrypted with core's secret key.
- **Mirror**: metadata for All Mail, Trash and Spam (full history, newest
  first, in the background), bodies fetched and cached on first open,
  attachments streamed on demand. One IDLE session per account, owned via a
  lease so replicas never double-sync, with an hourly reconciliation.
- **Triage**: unified list across accounts with per-account filter, views for
  Inbox / Starred / Snoozed / Sent / Drafts / Spam / Trash / All Mail and user
  labels. Archive, read state, star, trash, spam, labels (including creating
  them) write through to Gmail.
- **Snooze**: local only — Gmail is never told. Presets plus a custom time,
  wake on timer or on reply, woken threads surface at the top of the inbox.
- **Search**: local as you type (subject, sender, snippet); Gmail's own search
  syntax on Enter, run against each account and joined to mirrored threads.
- **Compose**: new, reply, reply-all, forward; local autosaved drafts; address
  autocomplete from seen headers; attachments staged in private S3; undo-send
  window; replies quote history and thread correctly, forwards carry the
  original attachments.

Out of scope: CRM integration, notifications beyond the unread badge, AI, a
phone layout, keyboard shortcuts, Gmail's category tabs (not exposed over IMAP).

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `NUXT_SECRET_ENCRYPTION_KEY` | yes | Encrypts stored app passwords (core). Losing it means every account must be reconnected. |
| `GMAIL_TRANSPORT` | no | `imap` (default) or `fake` (in-memory mailbox for tests) |
| `GMAIL_SYNC_TICK_SECONDS` | no | Session reconciliation cadence (default 30) |
| `GMAIL_SEND_SWEEP_SECONDS` | no | Outbound queue cadence (default 5) |

S3 (core's `S3_*`) is needed for outbound attachments only.

## Google-side setup (per account)

1. Turn on 2-Step Verification for the Google account.
2. Create an app password at https://myaccount.google.com/apppasswords.
3. In Gmail → Settings → Labels, make sure **All Mail**, **Trash** and **Spam**
   have "Show in IMAP" ticked (the connect step tells you which are hidden).

Workspace accounts need the admin to allow app passwords.

## Permissions

- `gmail.access` — open the app. Every row is the requesting user's own.

Default grants: `admin` yes, `member` nothing (grant via role or per-user grants).

## How it works

- `server/utils/gmail-transport*.ts` — the transport contract, the imapflow
  implementation, and the in-memory fake.
- `server/utils/gmail-sync.ts` — the mirror: new-mail ranges, CONDSTORE flag
  changes, paged backfill, reconciliation, thread aggregates.
- `server/utils/gmail-session-manager.ts` — per-account IDLE sessions with
  leases; request handlers borrow sessions through `gmailRunOnAccountSession`.
- `server/utils/gmail-threads.ts` — list/counts/detail and the triage actions.
- `server/utils/gmail-snooze.ts`, `gmail-drafts.ts`, `gmail-send.ts` — local
  snooze, the draft/outbox rows, and the send sweep.

Message identity is `(account, X-GM-MSGID)` so moves between folders update
the row rather than recreate it; thread rows are aggregates recomputed for
every touched `X-GM-THRID`.

## Local development

Set `GMAIL_TRANSPORT=fake` to work without a Google account; seed mailboxes
through `POST /api/gmail/_test/seed` and `POST /api/gmail/_test/deliver` (see
[tests/helpers/index.ts](tests/helpers/index.ts)). Tests:
`bun run test -- --project gmail` from `dev/`.

The production `start` script runs Nitro under Bun; imapflow relies on Node's
`tls`/`net` streams, which Bun implements but which have not been exercised
here against a live Gmail account under Bun. Verify a real connection on the
target runtime before relying on it.
