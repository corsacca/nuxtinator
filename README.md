# Nuxtinator

A layer-based foundation for Nuxt SaaS apps. You ship a tiny **host** (config + branding + project-specific pages); everything else — auth, admin, multi-tenancy, OAuth, MCP, bundled apps — lives in versioned **layers** that your host pulls from this repo at config-load time.

You own the host. You don't fork the layers. To get a newer cut of a feature, bump a ref.

## Getting Started

Nuxtinator projects are assembled by Claude Code. You tell it which layers you want; it scaffolds the host, edits `nuxt.config.ts` to extend just those layers, generates `.env.example` with only the vars those layers need, and verifies the project boots.

### 1. Create an empty directory

```bash
mkdir my-app && cd my-app
```

You don't need to scaffold a Nuxt project yourself — Claude pulls the host from this repo.

### 2. Open Claude Code in that directory

```bash
claude
```

### 3. Tell Claude to build from nuxtinator

Point it at this repo and describe what you want:

```
Build a Nuxt app from nuxtinator at
https://github.com/corsacca/nuxtinator

I want multi-tenant orgs, Mailgun email, OAuth + MCP,
and the calendar and kanban apps.
```

Claude will read this README, resolve dependencies, **confirm the layer list with you**, then scaffold by following the assembly instructions at the bottom of this file.

### 4. Configure and run

Once Claude finishes, fill in your `.env` and start the dev server:

```bash
cp .env.example .env   # then fill in real values (DATABASE_URL, JWT_SECRET, …)
bun install
bun run dev
```

Dev server: <http://localhost:2080>.

---

## Available layers

| Layer | Type | Description | Docs |
|---|---|---|---|
| [core](layers/core/) | Always | Auth, admin shell, RBAC, registries, single-mode `#tenant` kernel, migrations runner, launcher chrome. Never optional. | [layers.md](documentation/layers.md) |
| [tenancy](layers/tenancy/) | Optional | Multi-tenant orgs + memberships + RLS. Adds `/@:slug/...` URL aliases and the multi-mode `#tenant` kernel. Omit for single-tenant. | [tenancy.md](documentation/tenancy.md) |
| [email-mailgun](layers/email-mailgun/) | Choice | Mailgun (HTTP API in prod, MailHog locally). Provides `#email`. | — |
| [oauth](layers/oauth/) | Optional | OAuth 2.1 issuer (token, consent, admin endpoints). | — |
| [mcp](layers/mcp/) | Optional | MCP server transport. Depends on `oauth`. | — |
| [apps/calendar](layers/apps/calendar/) | Optional | Calendar app (events, reminders). | — |
| [apps/kanban](layers/apps/kanban/) | Optional | Kanban boards app. | — |
| [apps/messages](layers/apps/messages/) | Optional | Messaging / Gmail integration app. | — |
| [apps/videos](layers/apps/videos/) | Optional | Video recording + playback app. | — |
| [dev](layers/dev/) | Optional | UI sandbox at `/kitchen`. Useful in dev, comment out for prod. | — |

### Layer types

- **Always** — included in every project (`core`).
- **Choice** — pick at most one from a group. Currently the only choice group is **email backend** (`email-mailgun`; `email-smtp` and `email-ses` are planned). Skip the group entirely if your app doesn't send mail — code that imports `#email` will throw a clear error if no backend is loaded.
- **Optional** — included only if you ask for it.

Dependencies are resolved automatically: asking for `mcp` pulls in `oauth`; asking for `apps/messages` with Gmail support pulls in `oauth`.

---

## How layers actually load

Your host's [nuxt.config.ts](host/nuxt.config.ts) lists each layer by its package name (`@nuxtinator/<id>`). Nuxt resolves each name via standard node module resolution against `node_modules/`. The packages arrive there one of three ways, same path on disk in every case:

- **Workspace symlink** in this monorepo — `"@nuxtinator/core": "workspace:*"` in `host/package.json` points at `layers/core/`.
- **npm tarball** once layers are published.
- **Git URL** in `package.json` deps (`"github:org/repo#ref"`) when a layer lives in its own repo.

A `layer()` helper passes the package name through unless an env var redirects it. Point a single layer at a sibling checkout with `NUXTINATOR_<ID>_PATH` (id uppercased, hyphens become underscores) — e.g. `NUXTINATOR_MESSAGES_PATH=../../scratch/messages-experiment`. `bun link` works too.

See [documentation/getting-started.md](documentation/getting-started.md) for the full setup guide.

---

## Environment variables at a glance

Each layer has its own env-var requirements. Claude generates a `.env.example` containing only the ones for the layers you picked. The full superset:

### Core (required)

```env
APP_TITLE="My App"
DATABASE_URL=postgres://user:pass@localhost:5432/myapp
JWT_SECRET=<openssl rand -base64 32>
NUXT_SECRET_ENCRYPTION_KEY=<openssl rand -hex 32>   # exactly 64 hex chars
NUXT_PUBLIC_SITE_URL=http://localhost:2080
NODE_ENV=development
```

### Tenancy (multi-tenant only)

```env
APP_DATABASE_URL=postgres://app_user:...@.../db   # falls back to DATABASE_URL if unset
```

Multi-tenant production also requires a transaction-pooling connection pooler. See [tenancy.md](documentation/tenancy.md).

### Email (Mailgun)

```env
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_HOST=                     # only for EU region: api.eu.mailgun.net
SMTP_FROM=noreply@yourdomain.com
SMTP_FROM_NAME="My App"
```

### OAuth

```env
OAUTH_CONSENT_COOKIE_SECRET=<openssl rand -base64 32>
OAUTH_ALLOW_DCR=true
```

### MCP

```env
MCP_SERVER_NAME="My App"
MCP_SERVER_VERSION=1.0.0
```

### S3 (anything that uploads — videos, attachments)

```env
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
S3_PUBLIC_BASE_URL=               # only for public files
```

### Google OAuth (apps/messages with Gmail)

```env
NUXT_GOOGLE_CLIENT_ID=
NUXT_GOOGLE_CLIENT_SECRET=
NUXT_GOOGLE_OAUTH_REDIRECT_URI=http://localhost:2080/api/mail/accounts/google/callback
```

---

## Documentation

- [documentation/getting-started.md](documentation/getting-started.md) — manual setup walkthrough (if you'd rather not use Claude)
- [documentation/layers.md](documentation/layers.md) — what each layer owns, the `#tenant` kernel contract, how to write your own layer
- [documentation/single-tenant-deploy.md](documentation/single-tenant-deploy.md) — deploying without `tenancy`
- [documentation/tenancy.md](documentation/tenancy.md) — multi-tenant: roles, RLS, transaction-pooling
- [documentation/dev-setup.md](documentation/dev-setup.md) — for working on this monorepo itself

---
---

## Assembly instructions (for the AI scaffolding a new project)

> **This section is read by Claude Code when a user asks it to "build from nuxtinator".** If you're a human reader, skip it — the manual walkthrough is in [getting-started.md](documentation/getting-started.md).
>
> **Note:** The instructions below predate the named-package refactor (layers are now `@nuxtinator/<id>` packages, not path/giget-resolved). The high-level flow still applies — pick layers, scaffold a host, fill in .env — but the giget commands and `LAYERS_*` env vars referenced below are stale. A consumer artifact (starter repo or CLI scaffold) for the new model is an open design item.

When a user asks to build from this repo, follow these steps. Don't skip the confirmation step.

### Step 1: Parse the user's request

Read the **Available layers** table above. Map casual language to layer names:

- "auth" / "login" / "users" → already in `core` (no separate layer)
- "multi-tenant" / "orgs" / "organizations" / "workspaces" / "teams" → `tenancy`
- "single-tenant" / "no orgs" / "just one team" → omit `tenancy`
- "Mailgun" / "email" (default backend) → `email-mailgun`
- "no email" / "skip email" → omit any email layer
- "OAuth" / "OAuth server" / "issue tokens" → `oauth`
- "MCP" / "Model Context Protocol" → `mcp` (and `oauth`, automatically)
- "calendar" → `apps/calendar`
- "kanban" / "boards" → `apps/kanban`
- "messages" / "mail app" / "gmail" / "messaging" → `apps/messages`
- "videos" / "video recording" / "screen recording" → `apps/videos`
- "kitchen sink" / "UI sandbox" / "component showcase" → `dev`

### Step 2: Resolve dependencies and choices

1. Always include `core`.
2. Add every layer the user asked for.
3. Resolve dependencies — if the user asked for `mcp`, also include `oauth`. If they asked for `apps/messages` with Gmail features, also include `oauth`.
4. **Choice groups (email backend)**: if the user mentioned a provider, use it. If they mentioned email but no provider, default to `email-mailgun`. If they didn't mention email at all, **ask** before deciding — apps that send mail (auth flows, notifications) need a backend.
5. Default to including `dev` unless the user is scaffolding for production. Always mention you'll comment it out before prod build.

### Step 3: Confirm the layer list with the user

**This step is required.** Don't skip it. Present the resolved list and explicitly ask about anything ambiguous:

```
Based on your description, I'll wire up these layers:

  core                  (always — foundation: auth, admin, registries, kernel)
  tenancy               (you asked for multi-tenant orgs)
  email-mailgun         (you asked for Mailgun)
  oauth                 (required by mcp)
  mcp                   (you asked for MCP)
  apps/calendar         (you asked for calendar)
  apps/kanban           (you asked for kanban)
  dev                   (UI sandbox; comment out before prod build)

A few things to confirm:
  - Anything else from the available-layers list you want?
    (apps/messages, apps/videos)
  - Pin LAYERS_REF to a tag for prod, or track master for now?
```

Wait for confirmation before scaffolding.

### Step 4: Scaffold the host

Pull just the host directory from this repo into the user's project:

```bash
bunx giget github:corsacca/nuxtinator/host . --force
```

Run from the user's project directory. `giget` extracts only the `host/` subtree. If the user prefers a different package manager (`npm`, `pnpm`, `yarn`), use the equivalent invocation — the `host/` package.json doesn't lock you to bun, but the documentation assumes bun.

### Step 5: Edit nuxt.config.ts

Open the scaffolded `nuxt.config.ts`. The default `extends:` array lists every layer. Comment out (or delete) the `layer(...)` lines for layers the user **didn't** select. Keep the order: `core` first, `tenancy` second (so its multi-mode kernel overrides core's single-mode), email backend, `oauth`, `mcp`, app layers, `dev` last.

If the user wants `LAYERS_REMOTE` pointed at a fork, update the default in `nuxt.config.ts` (line 11). Otherwise leave it as `github:corsacca/nuxtinator/layers`.

### Step 6: Generate .env.example

The scaffolded `.env.example` already contains the union of every layer's vars. Trim it down to just the vars for the layers the user selected:

- Always keep the **Core** block.
- Keep `APP_DATABASE_URL` only if `tenancy` is selected.
- Keep the `MAILGUN_*` and `SMTP_FROM*` block only if `email-mailgun` is selected.
- Keep `OAUTH_*` only if `oauth` is selected.
- Keep `MCP_*` only if `mcp` is selected.
- Keep `S3_*` only if `apps/videos` or `apps/messages` is selected (or any other layer that uploads).
- Keep `NUXT_GOOGLE_*` only if `apps/messages` is selected.
- Keep the `LAYERS_PATH` comment — it's a useful pointer for anyone hacking against a local checkout.
- If the user picked a specific `LAYERS_REF`, add `LAYERS_REF=<their-ref>` (uncommented) to the file.

### Step 7: Customize branding

Update `APP_TITLE` in `.env.example` to a sensible default based on the project name (the directory name is a fine starting point). Update the `head.title` fallback in `nuxt.config.ts` if needed. Don't go beyond the title — the user will style the rest.

### Step 8: Install and verify

```bash
bun install
bun run dev
```

The first install will giget each selected layer into `node_modules/.c12/<hash>/`. The dev server should boot on port 2080. **If migrations fail** because the user hasn't filled in `DATABASE_URL` yet, that's expected — note it in your wrap-up.

Stop the dev server before reporting back (don't leave it running in the background).

### Step 9: Brief the user on what's next

After scaffolding is verified, tell the user:

- Fill in `.env` (database URL, JWT secret, encryption key, any provider credentials for the layers they selected). Generate secrets with the `openssl` commands shown in `.env.example`.
- Provision the database. For single-tenant: one role, one database — see [documentation/single-tenant-deploy.md](documentation/single-tenant-deploy.md). For multi-tenant: two roles (`host_admin` BYPASSRLS + `app_user` RLS-enforced) — see [documentation/tenancy.md](documentation/tenancy.md).
- Run `bun run dev`. The first user to register is automatically promoted to operator-admin.
- Adding a new app of their own: see [documentation/layers.md](documentation/layers.md#creating-a-new-app-layer). They can either drop pages directly into the host (project-specific code) or create a sibling layer in their own repo.
- Updating to a newer cut of nuxtinator: bump `LAYERS_REF` and `rm -rf node_modules/.c12 && bun install`.

### Things to **not** do

- **Don't fork the layers.** The user should consume them via giget, not copy them in. The host is the only thing they own.
- **Don't add layers to `extends:` that don't exist** in the available-layers table. If the user asks for something not on the list, say so and offer to scaffold a custom layer in their own repo (see [layers.md](documentation/layers.md)).
- **Don't pin `LAYERS_REF` to a SHA without telling the user** — they need to know what they're pinned to so they can bump it deliberately.
- **Don't run a production build** during scaffolding. Verify dev only.
