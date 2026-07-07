# Inbox layer — maintainer notes

Working doc for sessions building out `@nuxtinator/inbox`. [README.md](README.md) is the
consumer-facing overview (Mailgun/DNS setup lives there). The layer is a port of the
Doxa campaigns-server shared inbox (`~/code/doxa/campaigns-sever`), rebuilt on the CRM
layer's channel kernel; the plan and the port's decision record live in the repo's
session logs and the plan file referenced by them.

## What this layer is

A two-way shared email inbox: signed Mailgun webhooks in, a queued send sweep out, a
3-pane triage UI. Conversations key on `crm_channels` — the CRM address registry —
never on contact records: an inbound sender gets history before (and whether or not)
they ever become a contact. First app-layer→app-layer dependency in the monorepo
(`@nuxtinator/crm` in optionalDependencies; imports via `#crm/server`).

## Decision log (what we chose and why)

**Channel-keyed conversations.** `inbox_conversations.channel_id → crm_channels`, NOT
NULL, ON DELETE **NO ACTION** (not RESTRICT: an org deletion cascades into
crm_channels and inbox_conversations along independent FK paths, and RESTRICT's
immediate per-row check trips on whichever cascades second; NO ACTION defers to
statement end). Deliberate deltas vs Doxa: **threading is channel-strict** (the same
person writing from a second address forks a new conversation — Doxa accepted any
address of the subscriber), and **contact deletion no longer deletes threads**
(registry semantics; Doxa cascaded via subscriber_id). `counterparty_name` is
denormalized onto the conversation so the hot list query never joins crm tables;
linked-contact chips resolve per detail view, gated on
`resolveTypePermission(tx, ctx, 'contacts', 'read')`.

**The message row IS the send job.** No jobs table: outbound rows sit at status
`queued` with `attempts`/`next_attempt_at`; a croner sweep
([server/plugins/inbox-send-sweep.ts](server/plugins/inbox-send-sweep.ts), cadence
`INBOX_SEND_SWEEP_SECONDS`) claims each due row with an atomic queued→sent UPDATE
(`inboxClaimForSend`) **before** the provider call. Confirmed provider failure →
release with exponential backoff (or `failed` at 3 attempts); crash mid-send leaves it
`sent` without a provider id — **at-most-once**, same bias as Doxa. `markSent` copies
the provider Message-Id into `email_message_id` so contact replies thread back.

**CRM plumbing activated here.** DKIM/DMARC-authenticated inbound ⇒
`markChannelVerified` (the ONLY thing that ever verifies a channel — delivery events
never do). Delivery webhook: permanent fail/bounce ⇒ `suppress('hard_bounce')`,
complaint ⇒ `'complaint'`, `unsubscribed` ⇒ `revokeConsent({userId: null}, purpose
'marketing')` — consent flip only, never a suppression. Outbound gate is
**`isSuppressed()` only, never `canSend()`**: consent must not block 1:1
conversational replies (a bounce stops sends; a marketing unsubscribe doesn't).

**Webhook org routing** (no session): reply-token mail resolves O(1) via
`withRecordOrgContext` on `reply_token` (which is why the token unique is deliberately
**global** even in multi mode — 80 random bits can't collide); delivery events carry
`v:inbox-org` back from the send (fallback: scope-scan correlation on
provider_message_id); tokenless new mail scans org scopes for an `inbound_domain`
settings match. One distinct inbound (sub)domain per org; two orgs claiming the same
domain = unroutable + loud log. Settings live in **core_settings** (namespace `inbox`,
keys `inbound_domain` / `contact_address` / `auto_ack_enabled`; code defaults from
runtimeConfig, registered in [server/plugins/register-inbox.ts](server/plugins/register-inbox.ts)).

**Durability choreography (inbound).** tx A: dedupe by Message-Id (or a synthesized
sha256 stand-in) → thread → insert the claim row (bare ON CONFLICT). phase B (no tx):
attachments + raw MIME to S3; failure DELETES the claim row and 503s so Mailgun's
retry re-runs persistence (the committed conversation shell is reused —
`inboxGetRecentEmptyForChannel`, 24h window — so retries converge). tx C: side
effects (statuses, verification, notifications). A crash between B and C loses side
effects but never duplicates. Don't "fix" this into double-sending.

**Sender classification.** `contact` = new conversation, or sender channel ===
conversation channel. Everything else that reached a thread (valid token, wrong From)
is `held`: message status `held` + `needs_review` flag. **Held messages are never
reply anchors** — `inboxGetLastInbound` filters to `status='received'`, so replying
can't redirect staff mail (or the quoted history) to an intruder. There is no staff
reply-by-email path at all in v1 (deferred with the signed-address scheme).

**Anti-backscatter.** Courtesy mail (auto-ack for brand-new conversations, held-sender
notice) is post-commit fire-and-forget with RFC 3834 autoReply headers, and only to
authenticated senders that aren't themselves auto-responders. Vacation auto-replies
close the conversation quietly (never re-open, flag, or notify). `bounce+*@` recipients
are dropped (RFC 3834 responders reply to the Return-Path).

**Permissions: two slugs.** `inbox.access` (open, read, triage) and `inbox.send`
(compose/reply, spam blocklist — a sender-level verdict, not mere triage). Default
grants: admin everything, member nothing (staff tool; grant via role or per-user
grants). Staff alerts ride core `createNotification` — assignee gets
`email:'immediate'`, unassigned mail is a bell-only broadcast to inbox.access holders.

**Spam ≠ suppression.** The blocklist ([inbox_blocked_senders](migrations/inbox_001_create_tables.ts))
is an inbound routing verdict keyed by channel id; `crm_channel_suppressions` is
outbound deliverability truth. Marking spam blocklists the sender + closes all their
threads; further mail files into the spam thread silently. Unblocking reopens them as
`closed` (the triage queue must not flood).

## Table inventory (4)

`inbox_conversations` (channel FK, reply_token, needs_review, counterparty_name,
last_message denorms) · `inbox_messages` (direction CHECK — the only CHECK; statuses
`draft|queued|sent|delivered|failed|received|held` zod-owned; email_message_id partial
unique **rebuilt org-leading in T002**; queue bookkeeping columns) ·
`inbox_attachments` · `inbox_blocked_senders` (unique(channel_id), org-bound through
the FK — no T-rescope).

Migration rules: same as crm (`inbox_NNN_*` / `inbox_TNNN_*`, no org_id in regular
files, bare ON CONFLICT only — the dedupe index shape differs between modes).

## Hard-won gotchas (do not relearn)

1. **New server files need a dev-server restart.** Nitro's dev plugin/route scan does
   not reliably pick up files created after boot — plugins silently don't run (the
   apps-catalog seeder logging N apps is the tell). Restart `bun dev` after adding
   `server/plugins/*` or `server/routes/*` files.
2. Everything rides a scope transaction: kernel functions take `tx` and never import
   `db`; the ONLY `db`-touching inbox code is
   [inbox-org-routing.ts](server/utils/inbox-org-routing.ts) (scope iteration copies of
   core's file-private helpers) used by webhooks + the sweep.
3. The send sweep's advisory-lock key (`INBOX_SEND_SWEEP_LOCK_KEY`) is a committed
   constant, distinct from core's `84100723915584200xx` family. Don't change it
   without coordinating a rolling deploy.
4. Attachments are served ONLY through `/api/inbox/attachments/:id` (auth proxy,
   forced `Content-Disposition: attachment` + octet-stream — stored-XSS defense).
   Never hand the client a raw signed S3 URL: those can't override response headers.
5. `MAILGUN_WEBHOOK_SIGNING_KEY` is Mailgun's **HTTP webhook signing key**, not the
   sending API key — webhooks 401 with the wrong one. Replay-map tokens are released
   on retryable 5xx so Mailgun's retry isn't rejected as a replay.
6. In multi mode the env `INBOX_DOMAIN` default applies to EVERY org — with 2+ orgs
   that's instant routing ambiguity. Give each org an explicit `inbound_domain`
   override (settings) and treat the env var as the single-tenant default.
7. Tests sign fixtures with the real signing key (global-setup pins
   `MAILGUN_WEBHOOK_SIGNING_KEY`); there is no signature-skip seam. The sweep runs at
   2s in tests via `INBOX_SEND_SWEEP_SECONDS`.
8. reka-ui rejects `''` select-item values — the assignee picker uses the `__none__`
   sentinel (see [Thread.vue](app/components/inbox/Thread.vue)).

## Dev workflow

Run from `dev/`. Local mail lands in Mailpit (http://localhost:8025). Exercise inbound
locally with a signed multipart POST — the fixture builder in
[tests/helpers/index.ts](tests/helpers/index.ts) is the reference (HMAC-SHA256 of
`timestamp + token` with the signing key; Mailgun-shaped fields incl. a
`message-headers` JSON array with `Authentication-Results` for the authenticated
path). Tests: `bun run test -- --project inbox`. The app seeds into the catalog as
`available` — enable it per org (host admin UI or an `org_apps` row).

## Deferred (planned, not built)

Tags · canned responses · conversation notes/activity feed · shared drafts + outbound
attachments + inline-image CID pipeline · per-user sending identities/signatures
(`inbox_identities` per-org table; also restores alias-routed inbound) · staff
reply-by-email signed addresses (`contact+<token>.<exp>.<sig>@`; the recipient parser
already tolerates the shape) · contact-form endpoint + `#inbox/server` barrel (for a
future forms layer) · AI drafting/grounding/knowledge base (copy the context layer's
anthropic-client adapter; `ai_*` columns in their own migration) · CRM contact-page
conversations panel (needs a `registerCrmDetailPanel` seam in crm — wait for perms-v2
to land before touching `[type]/[id].vue`).
