# Helpinator — requirements (discovery output)

A Chatwoot-style AI help chat: an embeddable widget answers visitors from a
context portfolio via OpenRouter, logs every conversation, and hands off to the
shared inbox when a human is needed.

Status: implemented 2026-09-29 (see README.md). Elevation requires `inbox.send` as well as `helpinator.manage`.

## Placement & dependencies

- Upstream layer at `layers/apps/helpinator`, added to go-apps `layers.ts`.
- Requires `context` + `ai`. `inbox` (→ `crm`) is **optional**: without it the
  handoff and manual elevation are hidden/unavailable.
- Multi-tenant: widgets are org-scoped; an org can have many widgets (one per site).
- Public endpoints resolve the widget id → org server-side and run inside that
  org's scoped tx (same pattern as inbox's contact-form API key).

## Widget record (admin-managed)

- Bound to exactly **one portfolio** and **one default section** (`section_key`).
  No per-page section override in v1 — use another widget.
- Allowed origins list; per-widget daily message cap.
- Appearance: primary colour, position (bottom-right / bottom-left); texts:
  title, greeting, input placeholder, handoff prompt.
- Optional per-widget extra instructions, layered on a fixed built-in system
  prompt that owns the guardrails (answer only from the portfolio, don't invent,
  offer handoff).
- All config is server-side. The embed is only
  `<script src="https://<host>/js/helpinator-widget.iife.js">` +
  `<helpinator-widget host="…" widget-id="…">`; the widget fetches its config on load.
- **Per-site styling:** each widget is styled to match the site it's placed on.
  Server-configured colour is the default; the widget also exposes CSS custom
  properties (e.g. `--helpinator-primary`, and friends) so the host site can
  fine-tune from its own stylesheet.
- Admin helper: embed snippet generator (copy button) + live preview — like
  the feedback layer's widget helper.

## Chat

- One AI feature `helpinator.chat` (org's model/key resolution via `#ai/server`).
- Default section preloaded into the system prompt. Tools are read-only:
  list sections + `load_section`, **hard-scoped to the bound portfolio in the
  tool handlers** (not just the prompt). No write/proposal tools.
- Streaming replies (`onTextDelta`), rendered as sanitized Markdown; replies in
  the visitor's language.
- History is server-authoritative, keyed by an anonymous session token. The
  widget caches token + messages in `localStorage` (keyed by widget id) to
  survive refreshes; "New conversation" clears it. Each turn sends only the new
  message.
- Abuse limits: per-IP/per-session rate limit, per-widget daily cap,
  per-conversation turn cap (~50), per-message length cap (~2,000 chars).
- Config endpoint reports `aiAvailable` / `handoffAvailable`; if AI isn't
  configured the widget shows a short "unavailable" state.

## Portfolio isolation (prompt-injection defence)

Principle: the model can only leak what is in its context or reachable by its
tools, so other portfolios are made **unreachable in code**, not forbidden in
the prompt.

- Tools take **no `portfolio` argument** — only `section_key`. The handler binds
  `portfolio_id` from the widget record server-side. (Do not reuse context's
  `load_section`, which accepts a model-supplied slug.)
- Helpinator uses its own narrow queries, always `where portfolio_id = <widget's>`;
  never context's multi-portfolio loader, never the context MCP tools.
- Section index and prompt contain only this portfolio — no other portfolio
  names or slugs anywhere in the model's view.
- Cross-org isolation via tenancy RLS: widget id → org, whole turn in that org's tx.
- The conversation records `portfolio_id` at creation; if the widget is rebound,
  old conversations end rather than silently switching.
- Session tokens are bound to one widget; a token from widget A is rejected on B.
- Bot reads **live** context tables (no published snapshot).
- The **whole bound portfolio is exposed** (no per-widget section allowlist).
  Rule: a helpinator portfolio contains public info only — everything in it,
  plus the widget's extra instructions, must be treated as extractable.
- Never load section comments, version history, or editor names.
- Required tests: fake calls `load_section` with a key that exists only in
  another portfolio → "unknown section"; tool schema has no portfolio param;
  system prompt contains no other portfolio's slug/name; cross-widget session
  token rejected.
- Prompt guardrails / output filtering are tone aids only, not a security boundary.

## Email, handoff & elevation

- Optional "your email" field available at any time; saving it does not elevate.
  Stored on the helpinator conversation; the CRM channel is only created on elevation.
- "Still need help?" is always visible; the bot also suggests it when it can't answer.
- **Self-service handoff** → inbox intake util with `source='helpinator'`:
  transcript as first message, auto-ack carries the transcript + "we'll be in
  touch", conversation `open` + **unassigned** (unassigned = needs dispatch; no tag).
- At most one handoff per conversation. Afterwards the bot keeps answering with
  a "team will follow up by email" banner; later turns are not synced to inbox.
- **Manual elevation** (admin, only when an email was given): same intake util,
  **no auto-ack**, assigned to the elevating admin, then redirects into the inbox
  conversation with the composer ready to reply.
- Human replies go by email only — never shown in the widget.
- Staff are notified only on handoff (inbox's existing notifications).

## Admin log

- Read-only, per widget: transcript, sections loaded per turn, page URL, origin,
  user agent, email if given, link to the inbox conversation.
- IP used only for rate limiting — never stored raw (at most a salted hash).
- Kept indefinitely (no retention sweep in v1).

## Permissions

- `helpinator.access` — view logs. `helpinator.manage` — configure widgets, elevate.
- Defaults: admin both, member none.

## Upstream inbox change

- Extract contact-form intake into an exported server util accepting `source`,
  optional `extraMessage` (appended to the ack), skip-ack flag, and assignee.
  `contact.post.ts` calls the same util; its existing tests must keep passing.

## Out of scope (v1)

Human replies inside the widget, attachments, voice, per-widget model override,
per-page section override, staff notifications for new (non-handoff) chats.

## Open notes

- Should manual elevation also require `inbox.send`? (Recommended: yes — the
  admin lands in the composer.)
- Own CORS/origin-allowlist middleware (cf. `feedback-cors.ts`).
- Manual elevation sends no ack → no address-confirmation link → channel stays
  unverified (inbox composer will show it).
- Widget bundle weight: Vue + streaming + Markdown + sanitizer (e.g. DOMPurify).

## Risks

- AI cost: origin checks don't stop scripts; the daily cap is the real valve —
  surface usage vs cap in admin.
- Prompt injection can extract anything in the bound portfolio — portfolio must stay public-only (editor discipline, not code).
- Inbox's Mailgun inbound setup is a prerequisite for staff replies to thread back.
- Inbox intake refactor touches a public endpoint's internals.

---

# Implementation plan

## A. Inbox (upstream change)

1. `server/utils/inbox-intake.ts` — contact-form intake extracted into two kernel calls:
   - `inboxRecordIntake(tx, input)` — claim channel, optional consent, verification
     token, create conversation (`source`, `assignedUserId`), origin event, first
     inbound message (`message` text + optional `bodyHtml`), touch. Returns the ids
     and the ack context. Runs inside the caller's tx so a consumer (helpinator)
     can link its own row atomically.
   - `inboxAfterIntake(scope, created, { notify, ack, extraAckHtml })` — post-commit
     staff notification (own tx, swallowed) + auto-ack (fire-and-forget).
2. `inbox-courtesy.ts`: `extraHtml` on the ack context, appended after the standard body.
3. `contact.post.ts` becomes a thin caller of the two functions (behaviour unchanged).
4. Export both from `#inbox/server`; `INBOX_SOURCE_META.helpinator = Chat`.

## B. Helpinator layer (`layers/apps/helpinator`)

- `modules/inbox-bridge.ts` — aliases `#helpinator/inbox` to `server/bridge/inbox-real.ts`
  when `#inbox/server` is registered, else `inbox-stub.ts` (never imports inbox/crm).
- Migrations: `helpinator_001_create_widgets`, `_002_create_conversations`,
  `_003_create_messages`, `_T010_enable_tenancy` (all three tables).
- Utils: widgets (CRUD + appearance sanitising + public shape), sessions (random
  token, sha256 at rest, bound to widget), bot (prompt + single `load_section`
  tool bound to widget portfolio), limits (hashed-IP + session rate limits, daily
  cap), origins, transcript rendering.
- Public API `/api/v1/helpinator/widgets/:id/…` (CORS middleware, origin allowlist):
  `GET config`, `POST messages` (SSE stream or JSON; creates the conversation
  lazily and returns the token), `GET conversation`, `PUT email`, `POST handoff`.
- Admin API `/api/helpinator/…`: widgets CRUD + portfolio/section picker
  (`helpinator.manage`), conversations list/detail (`helpinator.access`),
  `POST conversations/:id/elevate` (`helpinator.manage` + `inbox.send`).
- Pages: `/helpinator` (conversation log), `/helpinator/conversations/:id`,
  `/helpinator/widgets`, `/helpinator/widgets/:id` (form, snippet, live preview).
- Embeddable `embeddables/helpinator-widget` (Vue custom element, marked + DOMPurify)
  → `public/js/helpinator-widget.iife.js`; CSS custom properties for per-site styling.
- Tests: isolation suite, public widget endpoints, admin CRUD, handoff/elevation.

## C. Wiring

- nuxtinator: root `workspaces`, `dev/layers.ts`, `dev/package.json`,
  `dev/vitest.config.ts`, `prod/layers.ts`.
- go-apps: `layers.ts` entry (fetch works once the layer is pushed/tagged upstream).
