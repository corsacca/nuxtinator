# Nuxtinator

A layer-based foundation for Nuxt SaaS apps. You ship a tiny **host** (config + branding + project-specific pages); everything else — auth, admin, multi-tenancy, OAuth, MCP, bundled apps — lives in versioned **layers** that your host's `package.json` pulls from this repo at install time.

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

Two artifacts, two mechanisms.

**This monorepo (maintainer side).** Layers live at `layers/<id>/` and `layers/apps/<id>/`. [host/package.json](host/package.json) lists each as `"@nuxtinator/<id>": "workspace:*"`; [host/nuxt.config.ts](host/nuxt.config.ts) extends by package name. Bun's workspace symlinks make each name resolve through `node_modules/@nuxtinator/<id>/` to the local source. One repo, one install, one resolution path.

**A consumer project (this is what the AI scaffolds).** No layer source on disk in the consumer's `package.json` deps. The project's `nuxt.config.ts` extends each layer via Nuxt's native giget syntax with a destination override:

```ts
[`github:corsacca/nuxtinator/layers/<id>#<ref>`, {
  install: true,
  giget: { dir: `.layers/<id>`, forceClean: true }
}]
```

On every `nuxt prepare` (which runs as `bun install`'s postinstall), giget fetches each layer's subpath from this repo into `.layers/<id>/` and runs the layer's own `bun install` to populate its dependencies. The consumer's `package.json` has **no** `@nuxtinator/*` entries — layers arrive via `extends:`, not via `dependencies`. Why: bun's `github:` dep protocol doesn't speak monorepo subpaths, but Nuxt's `extends:` (via c12 + giget) does.

A `layer()` helper in the consumer's `nuxt.config.ts` produces the tuple, with a per-layer env override: set `NUXTINATOR_<ID>_PATH=../../my-checkout` to point an individual layer at a sibling checkout during development (id uppercased, hyphens become underscores).

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
  - Pin to a tag/SHA for prod, or track `master` for now?
```

Wait for confirmation before scaffolding.

### Step 4: Copy the host into the user's project

Pull just the `host/` directory from this repo into the user's project:

```bash
bunx giget github:corsacca/nuxtinator/host . --force
```

Run from the user's project directory. `giget` is used here only as a one-shot file-copy tool — it extracts the `host/` subtree. The extracted host is the consumer artifact: everything the user owns and edits lives here.

The extracted `nuxt.config.ts` and `package.json` are tuned for **this monorepo** (`workspace:*` deps, extend-by-package-name). Steps 5 and 6 retune them for a **consumer** who pulls layers from this repo at install time via giget into `.layers/<id>/`.

### Step 5: Replace nuxt.config.ts's `layer()` helper and `extends:` block

The scaffolded `nuxt.config.ts` has a `layer()` helper that returns package names. That works in this monorepo (workspace symlinks resolve them) but not in a consumer project (the layers don't exist in `node_modules/`). Replace the helper + `extends:` block with the giget-based version below. Keep everything else in `nuxt.config.ts` (modules, ssr, runtimeConfig, devServer, etc.) unchanged.

```ts
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

declare const process: { env: Record<string, string | undefined> }

const LAYERS_DIR = '.layers'
const REF = process.env.NUXTINATOR_REF || 'master'

// id → subpath of corsacca/nuxtinator that contains the layer
const SUBPATH: Record<string, string> = {
  core:             'layers/core',
  tenancy:          'layers/tenancy',
  'email-mailgun':  'layers/email-mailgun',
  oauth:            'layers/oauth',
  mcp:              'layers/mcp',
  dev:              'layers/dev',
  calendar:         'layers/apps/calendar',
  feedback:         'layers/apps/feedback',
  kanban:           'layers/apps/kanban',
  'list-of-100':    'layers/apps/list-of-100',
  messages:         'layers/apps/messages',
  videos:           'layers/apps/videos'
}

function layer(id: keyof typeof SUBPATH) {
  // Per-layer local override: NUXTINATOR_<ID>_PATH=../../sibling-checkout
  const envKey = id.toUpperCase().replace(/-/g, '_') + '_PATH'
  const override = process.env[envKey]
  if (override) return override
  return [
    `github:corsacca/nuxtinator/${SUBPATH[id]}#${REF}`,
    {
      install: true,
      giget: { dir: `${LAYERS_DIR}/${id}`, forceClean: true }
    }
  ] as const
}

// Layers extracted from a full Nuxt project ship a tsconfig.json that
// references generated paths; Vite's tsconfig walker inspects .layers/
// (not node_modules/.c12/) and crashes if these aren't stripped first.
function stripLayerTsconfigs() {
  if (!existsSync(LAYERS_DIR)) return
  for (const name of readdirSync(LAYERS_DIR)) {
    const t = join(LAYERS_DIR, name, 'tsconfig.json')
    if (existsSync(t)) rmSync(t)
  }
}
stripLayerTsconfigs()

export default defineNuxtConfig({
  extends: [
    layer('core'),
    layer('tenancy'),          // omit for single-tenant
    layer('email-mailgun'),    // pick one email backend, or omit if no email
    layer('oauth'),
    layer('mcp'),
    layer('calendar'),
    layer('kanban'),
    // …other selected app layers in the same order as the available-layers table…
    layer('dev')               // remove before production build
  ],
  hooks: { 'modules:before': stripLayerTsconfigs }

  // …keep the rest of the scaffolded config unchanged…
})
```

Load-order rules carry over: `core` first; `tenancy` second so its multi-mode kernel overrides core's single-mode; email backend; `oauth`; `mcp`; app layers; `dev` last. Drop entries for layers the user didn't select — don't comment them out, just delete them.

`REF` defaults to `master`. For production pins, the user sets `NUXTINATOR_REF=v1.0.0` (or a SHA) in `.env`. `forceClean: true` re-extracts each layer on every prepare/dev/build — keeps it in sync with the ref but costs a few seconds per layer. Flip to `forceClean: false` once pinned if the re-extract cost matters.

Also add `.layers/` to `.gitignore` (the extracted host already gitignores `node_modules`, `.nuxt`, `.output`):

```gitignore
.layers
```

### Step 6: Strip `@nuxtinator/*` deps from package.json

The scaffolded `package.json` lists every layer as `"@nuxtinator/<id>": "workspace:*"`. Those only resolve inside this monorepo — in a consumer project they'd fail with `Workspace dependency "@nuxtinator/<id>" not found`. **Delete every `"@nuxtinator/*"` line from `dependencies`.** Don't replace them with anything — layers arrive via `extends:` (giget into `.layers/<id>/`), not via npm-style deps. bun's `github:` dep protocol does **not** handle monorepo subpaths, so a `"@nuxtinator/core": "github:corsacca/nuxtinator#master"` line would also fail; do not write one.

Keep all the non-`@nuxtinator/` dependencies (`nuxt`, `@nuxt/ui`, `@nuxt/eslint`, `kysely`, `kysely-postgres-js`, `postgres`, `tailwindcss`, `@iconify-json/*`, etc.) and all `devDependencies` (`bcrypt`, `jsonwebtoken`, `playwright`, etc.) — these are real npm packages the consumer needs directly.

Also: rename the `name` field from `"go-saas"` to the user's project name (kebab-case from the directory name is a fine default).

### Step 7: Generate .env.example

The scaffolded `.env.example` already contains the union of every layer's vars. Trim it down to just the vars for the layers the user selected:

- Always keep the **Core** block.
- Keep `APP_DATABASE_URL` only if `tenancy` is selected.
- Keep the `MAILGUN_*` and `SMTP_FROM*` block only if `email-mailgun` is selected.
- Keep `OAUTH_*` only if `oauth` is selected.
- Keep `MCP_*` only if `mcp` is selected.
- Keep `S3_*` only if `apps/videos` or `apps/messages` is selected (or any other layer that uploads).
- Keep `NUXT_GOOGLE_*` only if `apps/messages` is selected.
- Leave the `NUXTINATOR_<ID>_PATH` block commented out — it's a per-layer local-override hint useful only to people hacking on a layer in a sibling checkout.
- Add a commented `# NUXTINATOR_REF=master` line. The user can set it to a tag or SHA later for production pinning; the default if unset is `master`.

### Step 8: Customize branding

Update `APP_TITLE` in `.env.example` to a sensible default based on the project name (the directory name is a fine starting point). Update the `head.title` fallback in `nuxt.config.ts` if needed. Don't go beyond the title — the user will style the rest.

### Step 9: Install and verify

```bash
bun install
bun run dev
```

`bun install` installs the consumer's own deps (nuxt + framework peers), then runs `nuxt prepare` as its postinstall. `nuxt prepare` parses `nuxt.config.ts`, sees the giget tuples in `extends:`, and for each: fetches the layer's subpath from `github:corsacca/nuxtinator` into `.layers/<id>/`, then runs `bun install` inside that directory to populate the layer's own deps. Expect roughly one "Resolved/Saved lockfile/N packages installed" block per selected layer in the output.

After install, verify:

- `.layers/` contains a folder per selected layer, each with its own `nuxt.config.ts` + populated `node_modules/`.
- `.nuxt/` contains generated types (`tsconfig.json`, `nuxt.d.ts`, etc.).

The dev server should boot on port 2080. **If migrations fail** because the user hasn't filled in `DATABASE_URL` yet, that's expected — note it in your wrap-up.

Stop the dev server before reporting back (don't leave it running in the background).

### Step 10: Brief the user on what's next

After scaffolding is verified, tell the user:

- Fill in `.env` (database URL, JWT secret, encryption key, any provider credentials for the layers they selected). Generate secrets with the `openssl` commands shown in `.env.example`.
- Provision the database. For single-tenant: one role, one database — see [documentation/single-tenant-deploy.md](documentation/single-tenant-deploy.md). For multi-tenant: two roles (`host_admin` BYPASSRLS + `app_user` RLS-enforced) — see [documentation/tenancy.md](documentation/tenancy.md).
- Run `bun run dev`. The first user to register is automatically promoted to operator-admin.
- Adding a new app of their own: see [documentation/layers.md](documentation/layers.md#creating-a-new-app-layer). They can either drop pages directly into the host (project-specific code) or create a sibling layer in their own repo.
- Updating to a newer cut of nuxtinator: bump the `#<ref>` on each `@nuxtinator/*` dep in `package.json`, then `bun install`.

### Things to **not** do

- **Don't fork the layers.** The user pulls each via giget into `.layers/<id>/` on every prepare; they never own the layer source. The extracted host is the only thing they edit.
- **Don't add layers to `extends:` that don't exist** in the available-layers table. If the user asks for something not on the list, say so and offer to scaffold a custom layer in their own repo (see [layers.md](documentation/layers.md)).
- **Don't put `@nuxtinator/*` in the consumer's `package.json`** — not as `workspace:*` (only valid in this monorepo) and not as a `github:` URL (bun can't resolve a monorepo subpath through the `github:` dep protocol; install will fail). Layers come in via `extends:` only.
- **Don't pin to a SHA silently** — set `NUXTINATOR_REF` in `.env` for production pins and tell the user what they're pinned to so they can bump it deliberately.
- **Don't commit `.layers/`** — it's a build-time artifact (re-extracted on every prepare). Make sure `.gitignore` includes it.
- **Don't run a production build** during scaffolding. Verify dev only.
