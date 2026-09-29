# @nuxtinator/helpinator

An embeddable AI help chat. A site adds one `<script>` tag. Visitors then chat
with a bot that answers from **one context portfolio** through the ai layer's
OpenRouter backend. Staff get a read-only conversation log. A visitor who
still needs help is handed off to the shared inbox.

Requires `@nuxtinator/context` and `@nuxtinator/ai`. `@nuxtinator/inbox`
(which needs `@nuxtinator/crm`) is **optional**. Without it, the widget hides
"Still need help?" and staff can't elevate conversations.

## Features

- **Widgets.** One per site, managed under `/helpinator/widgets`. Each widget
  has:
  - a bound portfolio and a default section
  - an allowed-origins list
  - a daily message cap
  - optional extra instructions
  - appearance (colour, position, title, greeting, placeholder, handoff prompt)
- **Embed helper.** The widget page shows the snippet to paste, a CSS-variables
  block to match the site's look, and a live preview of the saved widget.
- **Chat.**
  - Replies stream over SSE.
  - Replies render as sanitized Markdown, in the visitor's language.
  - The default section is preloaded. The bot can `load_section` any other
    section of the bound portfolio.
  - The server holds the transcript. The browser caches it in `localStorage`
    so a refresh doesn't lose the chat.
- **Handoff.** "Still need help?" asks for an email and creates an **open,
  unassigned** inbox conversation (`source: 'helpinator'`) with the transcript
  as its first message. The visitor gets the inbox auto-ack plus a copy of the
  transcript. This happens at most once per conversation.
- **Staff elevation.** This needs `helpinator.manage` + `inbox.send`, and only
  works when the visitor left an email. It creates the inbox conversation
  **assigned to the elevating user**, sends the visitor nothing, and opens the
  inbox composer (`/inbox/<id>?reply=1`).
- **Log.** Read-only, filterable per widget and by handoff state. Each reply
  lists the sections it was grounded on. Each conversation shows its page URL,
  origin and user agent. Raw IPs are never stored.

## Setup

1. Add the layer to the host (`layers.ts`), after `context` and `ai`.
2. In AI settings, enable a model. The feature is **Helpinator — help chat**
   (`helpinator.chat`), one model for every widget in an org.
3. Create a portfolio that holds **public information only** (see Security).
4. Go to `/helpinator/widgets` → **New widget**. Pick the portfolio and default
   section, and add the site's origin, e.g. `https://www.example.org`.
5. Paste the snippet shown on the widget page into the site:

   ```html
   <script src="https://<host>/js/helpinator-widget.iife.js" defer></script>
   <helpinator-widget host="https://<host>" widget-id="<uuid>"></helpinator-widget>
   ```

   Add the `open` attribute to start with the chat open.

## Per-site styling

The server-configured colour is the default. The embedding site can override
any of these custom properties on the element (they inherit through the Shadow
DOM):

| Variable | Default |
|---|---|
| `--helpinator-primary` | the widget's colour |
| `--helpinator-on-primary` | `#fff` |
| `--helpinator-bg` / `--helpinator-text` / `--helpinator-muted` | white / near-black / grey |
| `--helpinator-border` / `--helpinator-bot-bubble` | light greys |
| `--helpinator-font` | system UI stack |
| `--helpinator-radius` | `14px` |
| `--helpinator-offset-x` / `--helpinator-offset-y` | `20px` |
| `--helpinator-width` / `--helpinator-height` | `370px` / `560px` |
| `--helpinator-z-index` | `2147483000` |

For deeper overrides, use `::part(launcher | panel | header | message |
user-message | bot-message | composer | send | form | banner)`.

## Security

- **Portfolio isolation is enforced in code, not in the prompt.**
  - The only tool is `load_section({ section_key })`. It takes no portfolio
    argument.
  - Every query filters on the conversation's snapshot of its widget's
    portfolio id.
  - The prompt lists only that portfolio's sections.
  - Other orgs are unreachable: the widget id resolves to its org, and the whole
    turn runs in that org's RLS-scoped transaction.
  - Rebinding a widget to another portfolio ends its open conversations.
  - Covered by `tests/api/isolation.test.ts`.
- **Everything in the bound portfolio is extractable**, and so are the widget's
  extra instructions. Prompt injection can make the bot reveal anything it can
  read. Keep helpinator portfolios public-only.
- **Origin checks only stop browsers.** The real bound on AI spend is:
  - rate limits keyed on an HMAC of the client IP (8 messages/min and 60/hour
    per client, 5 handoffs/hour)
  - the per-widget daily cap (visitor messages per rolling 24h)
  - a 50-message cap per conversation
  - a 2,000-character limit per message
- The session token is random and stored only as a sha256. A token is bound to
  one widget.

## Permissions

- `helpinator.access`: open the app and read the conversation log.
- `helpinator.manage`: configure widgets and elevate conversations. Elevation
  also needs `inbox.send`.

Default grants: `admin` gets both, `member` gets neither.

## Widget bundle

The source lives in [embeddables/helpinator-widget](embeddables/helpinator-widget/).
It builds into this layer's `public/js/`, which is committed and served by any
host that loads the layer. Rebuild with `bun run build:widgets` from the layer
root after changing the widget source.

## Tests

`bun run test -- --project helpinator` from `dev/`. The tests run against the
ai layer's VITEST fake, so no model key is needed.
