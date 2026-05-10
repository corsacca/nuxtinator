# Getting started — start a new project that consumes nuxtinator layers

This guide is for **downstream consumers**: you want a fresh project that uses [nuxtinator](https://github.com/corsacca/nuxtinator)'s layers (auth, admin, multi-tenancy, OAuth, MCP, the bundled apps), without forking the layers themselves.

You'll end up with a tiny "host" Nuxt app that lists which layers it wants in `nuxt.config.ts`. Nuxt fetches each one from GitHub at config-load time via giget and runs its install. You own the host repo; you can update the pinned ref whenever you want a newer cut of the layers.

If instead you want to work on the layers themselves, see [dev-setup.md](dev-setup.md).

---

## TL;DR

```bash
# 1. Pull just the host directory from the nuxtinator repo into a new project
bunx giget github:corsacca/nuxtinator/host my-app
cd my-app

# 2. Pick which layers you want
$EDITOR nuxt.config.ts        # comment out layers you don't need

# 3. Configure environment
cp .env.example .env          # then fill in DATABASE_URL, JWT_SECRET, etc.

# 4. Install + run
bun install
bun run dev                   # http://localhost:2080
```

That's it. The first `bun run dev` will:

1. Resolve each `layer('<name>')` in `extends:` to `github:corsacca/nuxtinator/layers/<name>#master`
2. Fetch each layer via giget into `node_modules/.c12/<hash>/`
3. Run `bun install` inside each fetched layer (their `install: true` flag) so layer-private deps land alongside
4. Boot Nitro, which discovers each layer's migrations and runs them against your DB

---

## Step 1: scaffold a host

The `host/` directory inside [corsacca/nuxtinator](https://github.com/corsacca/nuxtinator) is **the deployable**. Everything else in that repo is layer source you'll consume remotely. Copy just the host:

```bash
bunx giget github:corsacca/nuxtinator/host my-app
cd my-app
```

What you get:

```
my-app/
├── nuxt.config.ts        ← edit this to choose layers + branding
├── package.json          ← host-only deps (nuxt, ui, kysely, postgres, tailwind)
├── tsconfig.json
├── eslint.config.mjs
├── .env.example
├── public/
└── scripts/
    └── seed.ts
```

Initialize git if you want this to be your own project's repo:

```bash
git init && git add . && git commit -m "scaffold from nuxtinator"
```

---

## Step 2: choose your layers

Open [nuxt.config.ts](../host/nuxt.config.ts). The `extends:` array decides what's loaded:

```ts
extends: [
  layer('core'),              // required — auth, admin, registries, kernel, RBAC, chrome
  layer('tenancy'),           // optional — multi-tenant orgs/memberships/RLS. Omit for single-tenant.
  layer('email-mailgun'),     // optional — provides #email. Pick exactly one email backend if any.
  layer('oauth'),             // optional — OAuth 2.1 issuer
  layer('mcp'),               // optional — MCP server (depends on oauth)
  layer('apps/calendar'),     // optional — bundled apps. Drop any you don't want.
  layer('apps/kanban'),
  layer('apps/messages'),
  layer('apps/videos'),
  layer('dev')                // optional — UI sandbox at /kitchen. Comment out for prod.
]
```

Rules of thumb:

- **`core` is mandatory.** It owns the registries, auth, admin shell, and the single-mode `#tenant` kernel.
- **`tenancy` is the big switch.** With it: orgs, memberships, RLS, two DB roles, `/@:slug/...` URLs. Without it: single-tenant, one DB role, plain URLs. App layers work the same in both modes — see [layers.md](layers.md#the-tenant-kernel).
- **Email backends are pluggable.** Currently shipped: `email-mailgun`. Pick zero or one. With none loaded, code that imports `#email` throws helpfully on first call (so unused features stay quiet, but auth flows that send mail will fail loudly).
- **App layers are à la carte.** Keep what you want, delete what you don't. Each is self-contained.
- **Drop `dev` for production builds** — it adds the `/kitchen` sandbox.

---

## Step 3: pick a layer source (and optionally pin a ref)

By default, layers come from `github:corsacca/nuxtinator/layers` at branch `master`. You almost never need to change this, but two env vars let you:

```bash
# Optional — override the git source (e.g. point at your own fork of the layers)
LAYERS_REMOTE=github:your-org/your-fork/layers

# Optional — pin to a tag, branch, or commit SHA. Defaults to "master".
LAYERS_REF=v0.4.2
```

For a production deploy, **pin `LAYERS_REF`** to a tag or SHA. `master` will pull whatever the upstream HEAD is the next time c12 re-resolves, which can change behaviour silently.

For local development against an in-progress copy of the layers, set `LAYERS_PATH` instead — see [Working against local layer source](#working-against-local-layer-source-optional) below.

---

## Step 4: configure environment

```bash
cp .env.example .env
```

Then edit `.env`. Minimum required to boot:

```bash
APP_TITLE="My App"
DATABASE_URL=postgres://user:pass@localhost:5432/myapp
JWT_SECRET=<run: openssl rand -base64 32>
NUXT_PUBLIC_SITE_URL=http://localhost:2080
NUXT_SECRET_ENCRYPTION_KEY=<run: openssl rand -hex 32>   # exactly 64 hex chars
```

Add more depending on which layers you enabled:

| Layer | Extra env |
|---|---|
| `tenancy` | `APP_DATABASE_URL` (the `app_user` role; falls back to `DATABASE_URL` in single-deployment) |
| `email-mailgun` | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `SMTP_FROM`, `SMTP_FROM_NAME` |
| `oauth` | `OAUTH_CONSENT_COOKIE_SECRET` |
| `apps/messages` (Gmail integration) | `NUXT_GOOGLE_CLIENT_ID`, `NUXT_GOOGLE_CLIENT_SECRET`, `NUXT_GOOGLE_OAUTH_REDIRECT_URI` |
| Anything that uploads (videos, attachments) | `S3_*` vars |

The full list is in [.env.example](../host/.env.example).

---

## Step 5: provision the database

Postgres is required. Migrations run automatically on first boot — you just need a role and a database to connect to.

**Single-tenant** (no `tenancy` layer):

```sql
CREATE ROLE myapp LOGIN PASSWORD '<...>';
CREATE DATABASE myapp OWNER myapp;
GRANT ALL PRIVILEGES ON SCHEMA public TO myapp;
```

Set `DATABASE_URL=postgres://myapp:<...>@localhost:5432/myapp`. Done.

**Multi-tenant** (with `tenancy` layer):

You need two roles — `host_admin` (BYPASSRLS, used for migrations and cross-org admin) and `app_user` (RLS-enforced, the runtime default). And if you put a connection pooler in front, it must be transaction-pooling, not session-pooling. Full setup in [tenancy.md](tenancy.md).

---

## Step 6: run

```bash
bun install
bun run dev
```

First boot creates the schema (you'll see migration logs). Then visit <http://localhost:2080>, register an account, and promote yourself to operator-admin:

```bash
bun run scripts/seed.ts          # or whatever bootstrap path the core layer documents
```

> The exact bootstrap path may differ — check the seed script that came with the host scaffold for current instructions.

---

## Adding your own app layer

You don't need to fork the layers repo to add features. Two options:

1. **In-host code** — drop pages under `app/pages/<your-app>/` and routes under `server/routes/api/<your-app>/` directly in your host project. Anything you `import` resolves against the host's deps. Good for project-specific stuff that won't be reused.

2. **A new layer in your own repo** — create a sibling directory (or another git repo) shaped like the layers in nuxtinator and add a `layer()` entry in `extends:` pointing at it. The remote form is `github:your-org/your-repo/path-to-layer#ref`; the local form is just a relative path. See [layers.md](layers.md#creating-a-new-app-layer) for the full layer template.

Either way, you're adding to your own host without touching nuxtinator's code.

---

## Updating to a newer cut of nuxtinator

Bump `LAYERS_REF` in your `.env` (or change the default in `nuxt.config.ts`) to the new tag / branch / SHA, then:

```bash
rm -rf node_modules/.c12          # clear giget's cache
bun install
bun run dev
```

Read the upstream changelog before bumping — schema migrations included in newer layer cuts will run on first boot and may not be reversible.

---

## Working against local layer source (optional)

If you're contributing to nuxtinator itself, or want to hack on a layer in tandem with your host, clone nuxtinator separately and point `LAYERS_PATH` at it:

```bash
# Sibling layout:
#   ~/code/nuxtinator/      ← clone of github:corsacca/nuxtinator
#   ~/code/my-app/          ← your host (the giget'd one)

# In ~/code/my-app/.env:
LAYERS_PATH=../nuxtinator/layers
```

When `LAYERS_PATH` is set, `extends:` resolves to local file paths — `../nuxtinator/layers/core`, `../nuxtinator/layers/tenancy`, etc. — and giget is skipped. Layer deps resolve from your host's `node_modules/`.

To go back to remote layers, unset `LAYERS_PATH` and `bun install` again.

---

## Production deploy

Your host directory deploys standalone. There's no parent workspace, no sibling `layers/`, just the host:

```bash
bun install              # giget fetches each layer; `install: true` runs per-layer installs
bun run build            # standard Nuxt build
```

The output under `.output/` runs anywhere Nuxt runs (Node, Bun, Docker, your platform of choice). Set `NODE_ENV=production` and the same env vars you used in dev (with production values, obviously, and `LAYERS_PATH` unset).

For multi-tenant production specifics — the two-role split, transaction-pooling — see [tenancy.md](tenancy.md). For single-tenant, see [single-tenant-deploy.md](single-tenant-deploy.md).

---

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to download https://api.github.com/repos/corsacca/nuxtinator/...: 404` | `LAYERS_REF` points at a non-existent tag/branch | Pick an existing ref. `master` always exists. |
| `Cannot find package '<x>' imported from .c12/.../layers/<name>/...` | Upstream layer added a dep that the host doesn't carry, or a regression in the layer's package.json | Try clearing `node_modules/.c12` and reinstalling; if it persists, file an issue upstream |
| Layers don't update after bumping `LAYERS_REF` | giget's tarball cache is sticky | `rm -rf node_modules/.c12 && bun install` |
| Hangs on a page route that worked yesterday | Layer added a new migration that failed | Check the boot logs — failed migrations halt boot. Fix the DB state, restart |

---

## See also

- [layers.md](layers.md) — what each layer owns, how to write your own, the `#tenant` kernel contract
- [dev-setup.md](dev-setup.md) — for working on nuxtinator itself (the monorepo) rather than consuming it
- [single-tenant-deploy.md](single-tenant-deploy.md) — single-tenant specifics
- [tenancy.md](tenancy.md) — multi-tenant specifics: roles, RLS, pooling
