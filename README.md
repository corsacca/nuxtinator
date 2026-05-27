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

**A consumer project (this is what the AI scaffolds).** Each layer is fetched via a `sync-layers` script (which uses `giget` under the hood) into a local `_layers/<id>/` directory. The consumer's `package.json` declares those as **bun workspace members** (`"workspaces": ["_layers/*"]`); on `bun install`, bun reads each layer's `package.json`, merges its `dependencies` into the resolution graph, and symlinks each layer as `node_modules/@nuxtinator/<id>/`. Nuxt's `extends:` resolves by package name through that symlink. Layer source is visible at `_layers/<id>/` for inspection, debugging, or grep.

Net: one `node_modules/` at the root, no per-layer install, no per-layer duplication of the framework peer tree. Each layer's `package.json` remains the source of truth for its deps — the consumer's `package.json` never lists them, and a layer's dep changes flow through on the next `sync-layers && bun install` automatically.

Bootstrap is three commands wrapped as `bun run setup`:

1. `bun install` — installs the consumer's root deps including `giget`. The `_layers/*` workspaces glob doesn't match yet (the directory doesn't exist).
2. `bun run sync-layers` — calls `giget` for each selected layer; extracts `github:corsacca/nuxtinator/layers/<id>#<ref>` into `_layers/<id>/`.
3. `bun install` (second pass) — bun re-evaluates the workspaces glob, now finds `_layers/<id>/` directories, hoists their deps into the root `node_modules/.bun/` store, and creates `node_modules/@nuxtinator/<id>/` symlinks.

Day-to-day is just `bun run dev`. Updating: `NUXTINATOR_REF=<tag>` in `.env`, then `bun run setup` again (the layer dirs get force-cleaned and refetched).

A `layer()` helper in the consumer's `nuxt.config.ts` honors a per-layer env override: set `NUXTINATOR_<ID>_PATH=../../my-checkout` to point an individual layer at a sibling checkout during development (id uppercased, hyphens become underscores). Without an override, the package-name extends through the workspace symlink.

> **Important: the layer directory must be named `_layers/`, not `.layers/`.** Bun's workspaces glob follows minimatch's default `dot: false` and silently won't match dot-prefixed directories. `"workspaces": [".layers/*"]` makes `bun install` succeed but never create the workspace symlinks — no error message, nothing works. The `_layers/` name (or any non-dot name) is required.

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

> **Read this before you do anything else.** Confirmation is non-negotiable, even in auto / headless / agent-orchestrated mode. Step 3 below presents the resolved layer list and waits for the user; **you do not skip it**, you do not pick "a sensible default" because the user didn't specify, you do not scaffold first and let them "redirect later." The layer set IS the decision the user is making by invoking you — guessing it is wasted work for both of you (reverting a wrong scaffold is more work than asking up front). If you genuinely have no way to receive a reply, **halt** and surface the missing-input to whoever orchestrates you. Do not write any file until the layer list is confirmed.

When a user asks to build from this repo, follow these steps in order.

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

### Step 3: Confirm the layer list with the user (required, no exceptions)

**Auto mode, headless mode, or any other framing does not bypass this step.** The whole point of the layer system is choice; scaffolding a wrong set is wasted work for both of you. Present the resolved list and explicitly ask about anything ambiguous:

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
    (apps/messages, apps/videos, apps/feedback)
  - Pin to a tag/SHA for prod, or track `master` for now?
```

**Wait for confirmation before doing anything in Step 4 onward.** Specifically:

- **Do not pick "a sensible default" for the user.** The layer set IS the decision they're making — you cannot guess it for them. "Reasonable starter" is not a fallback; "ask" is.
- **If the user didn't mention email at all**, the confirmation message must explicitly ask whether they want email. Don't silently include `email-mailgun`; don't silently omit an email backend either. The user has to say.
- **If the user didn't mention apps/* at all**, default the proposed list to no app layers and the confirmation message must list every available app layer so they can pick.
- **If you genuinely have no way to ask** (true non-interactive context with no orchestrator inbox), halt. Tell whatever invoked you that the layer list is needed. **Do not write files.** A wrong scaffold is worse than no scaffold.

### Step 4: Copy the host into the user's project

Pull just the `host/` directory from this repo into the user's project:

```bash
bunx giget github:corsacca/nuxtinator/host . --force
```

Run from the user's project directory. `giget` is used here only as a one-shot file-copy tool — it extracts the `host/` subtree. The extracted host is the consumer artifact: everything the user owns and edits lives here.

The extracted `nuxt.config.ts` and `package.json` are tuned for **this monorepo** (`workspace:*` deps pointing at sibling `layers/`). Steps 5 and 6 retune them for a **consumer** who fetches layers via `sync-layers` and consumes them as bun workspace members under `_layers/<id>/`.

### Step 5: Edit nuxt.config.ts — trim extends, add the strip hook

The scaffolded `nuxt.config.ts` already has the right shape — a `layer()` helper that returns the package name (with a `NUXTINATOR_<ID>_PATH` env override) and an `extends:` array calling `layer('@nuxtinator/<id>')` for each layer. Two edits:

**1. Trim the `extends:` array** to only the layers the user selected, in load order: `core` first; `tenancy` second (so its multi-mode kernel overrides core's single-mode); email backend; `oauth`; `mcp`; app layers; `dev` last. Delete entries for layers not selected — don't comment them out.

**2. Add a tsconfig strip hook** at the top of the file (before `defineNuxtConfig`). A layer's `tsconfig.json` references paths Vite's walker can crash on; this defensive cleanup is cheap:

```ts
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const LAYERS_DIR = '_layers'

function stripLayerTsconfigs() {
  if (!existsSync(LAYERS_DIR)) return
  for (const name of readdirSync(LAYERS_DIR)) {
    const t = join(LAYERS_DIR, name, 'tsconfig.json')
    if (existsSync(t)) rmSync(t)
  }
}
stripLayerTsconfigs()
```

And add `hooks: { 'modules:before': stripLayerTsconfigs }` inside the `defineNuxtConfig({ ... })` block (alongside `modules:`, `ssr:`, etc.).

Final shape — keep the existing `layer()` helper, leave the rest of the scaffolded config untouched:

```ts
// ...the scaffolded `layer()` helper stays as-is...
function layer(pkg: string): string {
  const envKey = pkg.replace(/^@/, '').replace(/[/-]/g, '_').toUpperCase() + '_PATH'
  return process.env[envKey] || pkg
}

// ...stripLayerTsconfigs() block from above...

export default defineNuxtConfig({
  extends: [
    layer('@nuxtinator/core'),
    layer('@nuxtinator/tenancy'),          // omit for single-tenant
    layer('@nuxtinator/email-mailgun'),    // pick one email backend, or omit
    layer('@nuxtinator/oauth'),
    layer('@nuxtinator/mcp'),
    layer('@nuxtinator/calendar'),
    layer('@nuxtinator/kanban'),
    // ...other selected app layers in load order...
    layer('@nuxtinator/dev')               // remove before production build
  ],
  hooks: { 'modules:before': stripLayerTsconfigs }

  // ...keep modules, ssr, runtimeConfig, devServer, etc. as scaffolded...
})
```

No giget tuples in `extends:`, no `install: true`, no `forceClean`. Nuxt resolves each `@nuxtinator/<id>` through the bun workspace symlink set up in Step 6.

### Step 6: Rewrite package.json — workspaces, scripts, giget devDep

The scaffolded `package.json` has every layer as `"@nuxtinator/<id>": "workspace:*"` and `postinstall: nuxt prepare`. Four structural edits:

1. **Rename `name`** from `"go-saas"` to the user's project name (kebab-case from the directory name is a fine default).
2. **Strip every `"@nuxtinator/*"` line from `dependencies`.** Layers come in as workspace members (set up below), not as npm deps. Keep all the non-`@nuxtinator/` dependencies (`nuxt`, `@nuxt/ui`, `kysely`, `kysely-postgres-js`, `postgres`, `tailwindcss`, `@iconify-json/*`, etc.) and the existing `devDependencies` (`@nuxt/eslint`, `vitest`, `playwright`, etc.).
3. **Add `"workspaces": ["_layers/*"]`** at the top level. This is what hoists each fetched layer's deps to root `node_modules/` and symlinks `node_modules/@nuxtinator/<id>/`.
4. **Replace the `scripts` block** with the setup-aware version below and **remove `postinstall: nuxt prepare`** entirely. Reason: postinstall would fire during the first `bun install` before layers are fetched, and `nuxt prepare` would error trying to extend non-existent paths. The `setup` script handles ordering correctly.
5. **Add `giget` to `devDependencies`** (used by `scripts/sync-layers.ts`).
6. **Create `bunfig.toml`** at the project root with:

```toml
[install]
linker = "hoisted"
```

Bun 1.3+ defaults to the **isolated** linker for workspaces. Under isolated, cross-workspace deps appear in each member's local `node_modules/@nuxtinator/<id>/` (so a layer's own code can `import '@nuxtinator/core'`), but the **top-level** `node_modules/@nuxtinator/<id>/` symlinks **are not created**. Nuxt's `extends: [layer('@nuxtinator/core')]` resolves by package name from the project root — without the top-level symlink, the resolution fails and `nuxt prepare` errors with `Cannot find module '@nuxtinator/core'`. Hoisted mode restores the top-level symlinks and matches how the maintainer monorepo resolves. `bunfig.toml` is one of the few files this recipe genuinely needs at the project root.

```jsonc
{
  "name": "my-project",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.14",
  "workspaces": ["_layers/*"],
  "scripts": {
    "sync-layers": "bun run scripts/sync-layers.ts",
    "setup": "bun install && bun run sync-layers && bun install",
    "dev": "nuxt dev",
    "build": "nuxt build",
    "start": "bun .output/server/index.mjs",
    "preview": "nuxt preview",
    "typecheck": "nuxt typecheck",
    "lint": "eslint .",
    "seed": "bun run scripts/seed.ts",
    "test": "nuxt prepare && node scripts/run-tests.mjs",
    "test:watch": "nuxt prepare && vitest",
    "test:e2e": "nuxt prepare && playwright test"
  },
  "dependencies": {
    // ...all non-@nuxtinator/* deps from the scaffolded host...
  },
  "devDependencies": {
    "giget": "^1.2.0"
    // ...all the scaffolded devDeps...
  }
}
```

> **Critical: use `_layers/*`, not `.layers/*`** for the workspaces glob. Bun's workspaces follow minimatch's default `dot: false` and won't match dot-prefixed directories. `bun install` succeeds silently but no workspace symlinks are created — no error message, nothing works. This is the #1 footgun of this recipe.

### Step 6.5: Write scripts/sync-layers.ts

The fetcher script. Create the directory and the file:

```bash
mkdir -p scripts
```

```ts
// scripts/sync-layers.ts
import { downloadTemplate } from 'giget'

declare const process: { env: Record<string, string | undefined>, exit: (code: number) => never }

const REF = process.env.NUXTINATOR_REF || 'master'

// All known layers. Keep the full map; SELECTED below is what's actually fetched.
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

// The layers this project uses — must match the entries in nuxt.config.ts's extends.
const SELECTED: Array<keyof typeof SUBPATH> = [
  'core',
  'tenancy',
  'email-mailgun',
  'oauth',
  'mcp',
  'calendar',
  'kanban',
  // ...one entry per layer, in load order...
  'dev'
]

for (const id of SELECTED) {
  if (!SUBPATH[id]) {
    console.error(`Unknown layer: ${id}`)
    process.exit(1)
  }
  const url = `github:corsacca/nuxtinator/${SUBPATH[id]}#${REF}`
  console.log(`Fetching ${id} from ${url}`)
  await downloadTemplate(url, { dir: `_layers/${id}`, forceClean: true })
}

console.log(`\nFetched ${SELECTED.length} layers. Run 'bun install' to hoist their deps via workspaces.`)
```

`forceClean: true` re-extracts each layer on every `sync-layers` run, keeping it in sync with the ref. The per-layer env override (`NUXTINATOR_<ID>_PATH`) is honored by `nuxt.config.ts`'s `layer()` helper at Nuxt-time — `sync-layers.ts` doesn't need to know about it.

**Two places to keep in sync** when adding/removing layers (note this to the user):
- `SELECTED` in `scripts/sync-layers.ts`
- `extends` in `nuxt.config.ts`

Add `_layers/` to `.gitignore`:

```gitignore
node_modules
.nuxt
.output
.env
_layers
```

### Step 7: Generate .env.example

The scaffolded `.env.example` already contains the union of every layer's vars. Trim it down to just the vars for the layers the user selected:

- Always keep the **Core** block.
- Keep `APP_DATABASE_URL` only if `tenancy` is selected.
- Keep the `MAILGUN_*` and `SMTP_FROM*` block only if `email-mailgun` is selected.
- Keep `OAUTH_*` only if `oauth` is selected.
- Keep `MCP_*` only if `mcp` is selected.
- Keep `S3_*` only if `apps/videos` or `apps/messages` is selected (or any other layer that uploads).
- Leave the `NUXTINATOR_<ID>_PATH` block commented out — it's a per-layer local-override hint useful only to people hacking on a layer in a sibling checkout.
- Add a commented `# NUXTINATOR_REF=master` line. The user can set it to a tag or SHA later for production pinning; the default if unset is `master`.

### Step 8: Customize branding

Update `APP_TITLE` in `.env.example` to a sensible default based on the project name (the directory name is a fine starting point). Update the `head.title` fallback in `nuxt.config.ts` if needed. Don't go beyond the title — the user will style the rest.

### Step 9: Bootstrap and verify

```bash
bun run setup
bun run dev
```

`bun run setup` runs the three-phase bootstrap defined in the `scripts` block:

1. **`bun install`** — installs the consumer's root deps (nuxt + framework peers + giget). The `_layers/*` workspaces glob doesn't match yet (directory doesn't exist), so no layers are linked. Expect ~700–800 packages.
2. **`bun run sync-layers`** — calls `giget` for each entry in `SELECTED`, extracting the layer's subpath from `github:corsacca/nuxtinator` into `_layers/<id>/`. Expect a "Fetching <id> from ..." line per layer.
3. **`bun install`** (second pass) — bun re-evaluates the workspaces glob, finds `_layers/<id>/` directories, reads each layer's `package.json`, merges their `dependencies` into the resolution graph, places everything in the root `node_modules/.bun/` content-addressable store, and symlinks each layer as `node_modules/@nuxtinator/<id>/`. Package count grows; `bun pm ls` shows `@nuxtinator/<id>@workspace:_layers/<id>` entries.

After setup, verify:

- `_layers/` contains a folder per selected layer with its source (`nuxt.config.ts`, `package.json`, the layer's own dirs).
- `_layers/<id>/node_modules/` is a directory of **symlinks** pointing into `../../../node_modules/.bun/<pkg>@<v>/...` — NOT a populated install. If you see real package directories with content here, something's off (probably the dot-prefix footgun or a stale lockfile from a previous failed run; delete `bun.lock` + `node_modules` and retry).
- `node_modules/@nuxtinator/<id>/` is a symlink to `../../_layers/<id>/`. `readlink node_modules/@nuxtinator/core` should confirm. **If this is missing**, `bunfig.toml` is wrong or absent — bun 1.3 defaults to isolated linker which doesn't create these top-level symlinks.
- `bun pm ls` lists `@nuxtinator/<id>@workspace:_layers/<id>` for each layer.
- `bun run dev` boots Nuxt on port 2080.

**If migrations fail** because the user hasn't filled in `DATABASE_URL` yet, that's expected — note it in your wrap-up. Stop the dev server before reporting back (don't leave it running in the background).

### Step 10: Brief the user on what's next

After scaffolding is verified, tell the user:

- Fill in `.env` (database URL, JWT secret, encryption key, any provider credentials for the layers they selected). Generate secrets with the `openssl` commands shown in `.env.example`.
- Provision the database. For single-tenant: one role, one database — see [documentation/single-tenant-deploy.md](documentation/single-tenant-deploy.md). For multi-tenant: two roles (`host_admin` BYPASSRLS + `app_user` RLS-enforced) — see [documentation/tenancy.md](documentation/tenancy.md).
- Run `bun run dev`. The first user to register is automatically promoted to operator-admin.
- Adding a new app of their own: see [documentation/layers.md](documentation/layers.md#creating-a-new-app-layer). They can either drop pages directly into the host (project-specific code) or create a sibling layer in their own repo.
- Updating to a newer cut of nuxtinator: set `NUXTINATOR_REF=<tag-or-sha>` in `.env` (or change the default in `scripts/sync-layers.ts`), then run `bun run setup` again. `forceClean: true` in the script means each layer is re-extracted from the new ref.

### Things to **not** do

- **Don't fork the layers.** The user fetches each via `sync-layers` into `_layers/<id>/`; they never own the layer source. The extracted host is the only thing they edit.
- **Don't add layers to `extends:` (or to `SELECTED` in `sync-layers.ts`) that don't exist** in the available-layers table. If the user asks for something not on the list, say so and offer to scaffold a custom layer in their own repo (see [layers.md](documentation/layers.md)).
- **Don't put `@nuxtinator/*` in the consumer's `package.json` `dependencies`** — not as `workspace:*` (only valid in this monorepo) and not as a `github:` URL (bun's `github:` dep protocol can't resolve a monorepo subpath; install will fail). Layers arrive as workspace members via the `_layers/*` glob in Step 6, not as npm deps.
- **Don't use `.layers/*` for the workspaces glob.** Bun's minimatch doesn't match dot-prefixed dirs. Use `_layers/*` or any other non-dot name. There is no error if you get this wrong — `bun install` succeeds, no symlinks get made, nothing works.
- **Don't skip `bunfig.toml`** with `linker = "hoisted"`. Bun 1.3+ defaults to the isolated linker, which doesn't create the top-level `node_modules/@nuxtinator/<id>` symlinks Nuxt needs to resolve `extends: [layer('@nuxtinator/core')]` by package name. Symptom: `nuxt prepare` errors with `Cannot find module '@nuxtinator/<id>'`. The fix is `linker = "hoisted"` in `bunfig.toml`.
- **Don't leave `postinstall: nuxt prepare`** in the consumer's `package.json`. It runs before layers are fetched on the first install and errors trying to extend non-existent paths. The `setup` script orchestrates the right order; if the user wants `nuxt prepare` to run automatically after install, they need a real lifecycle hook that runs *after* `sync-layers`, not before.
- **Don't pin to a SHA silently** — set `NUXTINATOR_REF` in `.env` for production pins and tell the user what they're pinned to so they can bump it deliberately.
- **Don't commit `_layers/`** — it's a build-time artifact (re-fetched on every `sync-layers` run). Make sure `.gitignore` includes it.
- **Don't run a production build** during scaffolding. Verify dev only.
