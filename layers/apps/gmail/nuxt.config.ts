// Gmail layer — a personal multi-account Gmail client. Accounts connect over
// IMAP/SMTP with Google app passwords (no OAuth, no Google verification), mail
// metadata is mirrored into Postgres, bodies are fetched on first open, and
// snooze is local state that never writes to Gmail.
//
// The IMAP transport is selectable through runtimeConfig so tests run against
// an in-memory fake mailbox instead of Google.
export default defineNuxtConfig({
  runtimeConfig: {
    // 'imap' talks to imap.gmail.com / smtp.gmail.com; 'fake' is the in-memory
    // transport the test suite drives through /api/gmail/_test/* seams.
    gmailTransport: process.env.GMAIL_TRANSPORT || 'imap',
    // Outbound queue sweep cadence in seconds. Tests lower it so queued sends
    // become observable quickly.
    gmailSendSweepSeconds: process.env.GMAIL_SEND_SWEEP_SECONDS || '5',
    // Seconds between the sync manager's reconciliation ticks (start sessions
    // for new accounts, stop removed ones, retry failed connections).
    gmailSyncTickSeconds: process.env.GMAIL_SYNC_TICK_SECONDS || '30'
  }
})
