# Dev setup

How to get this repo running locally, and the moving parts that make it work.

## Quick start

```bash
git clone <this repo>
cd go-saas
bun install                                          # installs the bun workspace
cp host/.env.example host/.env                       # then fill in DATABASE_URL etc.
cd host && bun run dev
```

Dev server: <http://localhost:2080>.

## Repo shape

```
go-saas/
├── package.json         ← workspace root (lists host + layers as workspaces)
├── bun.lock             ← single lockfile for the whole monorepo
├── bunfig.toml          ← linker = "hoisted" so layers see host's peer deps
├── node_modules/        ← hoisted; layers resolve deps from here
├── host/                ← the Nuxt app shell. cwd for all dev/build commands.
│   ├── nuxt.config.ts
│   ├── package.json     ← host-only deps (nuxt, ui, kysely/postgres, tailwind)
│   └── .env, .env.example
└── layers/              ← reusable layers (siblings of host)
    ├── core/            ← always-on foundation
    │   └── package.json ← bcrypt, jsonwebtoken, s3-lite-client; nuxt/kit/ui/kysely peer
    ├── tenancy/         ← optional multi-tenant (peer-deps only)
    ├── email-mailgun/   ← optional email backend (nodemailer + mailgun transport)
    ├── oauth/, mcp/, dev/
    └── apps/calendar/, apps/kanban/, apps/messages/, apps/videos/
```

Each layer has its own `package.json` declaring exactly what it imports — layer-private deps in `dependencies`, framework/DB singletons in `peerDependencies` so they resolve to the host's installed copy.

Run all dev/build commands from `host/`:

```
bun run dev          # dev server (port 2080, runs migrations on boot)
bun run build        # prod build
bun run preview      # preview built app
bun run lint         # eslint
bun run typecheck    # vue-tsc / nuxt typecheck
```

## How layers are wired

[host/nuxt.config.ts](../host/nuxt.config.ts) builds its `extends:` array dynamically, so the same config works for local dev (file paths) and production (git-fetched layers via [giget](https://github.com/unjs/giget) with c12's `install: true`):

```ts
function layer(name: string): string | [string, { install: true }] {
  if (LAYERS_PATH) return `${LAYERS_PATH}/${name}`
  return [
    `${LAYERS_REMOTE}/${name}${LAYERS_REF}`,
    { install: true }
  ]
}

extends: [layer('core'), layer('tenancy'), layer('email-mailgun'), ...]
```

Three env vars control resolution:

| Var | When set | Effect |
|---|---|---|
| `LAYERS_PATH` | Dev (`host/.env` has `LAYERS_PATH=../layers`) | Each layer resolves to `${LAYERS_PATH}/<name>` — a local file path. The bun workspace at the repo root makes layer deps resolve from the hoisted `node_modules/`. |
| `LAYERS_REMOTE` | Falls back to `github:corsacca/go-saas/layers` baked into `nuxt.config.ts`. Set to override (e.g. fork) | Used when `LAYERS_PATH` is unset |
| `LAYERS_REF` | Optional | Appended as `#<ref>` to the remote URL (branch/tag/SHA) |

In production, `LAYERS_PATH` is unset, so Nuxt passes each layer's tuple to c12 — giget fetches the layer source from `${LAYERS_REMOTE}/<name>${LAYERS_REF}` and `install: true` runs an install inside the fetched layer directory. Layers + their deps land in `host/node_modules/.c12/<hash>/`.

Each layer's own `package.json` declares its dependencies — that's what `install: true` reads. Framework/DB singletons (`nuxt`, `@nuxt/kit`, `@nuxt/ui`, `kysely`, `kysely-postgres-js`, `postgres`, `h3`, `vue`, `tailwindcss`) are listed as `peerDependencies` so they resolve to the host's installed copy rather than getting duplicated under `.c12/`.

Downstream projects that copy this blueprint can either keep the same `LAYERS_REMOTE` (consume layers as-is) or fork the layers repo and override `LAYERS_REMOTE` in their `.env`.

## Adding a layer

1. Create `layers/<id>/` with code + `package.json` (deps for what it imports, peerDeps for shared singletons).
2. Add `"layers/<id>"` to the `workspaces` array in the root [package.json](../package.json).
3. Add `layer('<id>')` to `extends:` in [host/nuxt.config.ts](../host/nuxt.config.ts).
4. `bun install` from root, then `cd host && bun run dev`.

Push to git and the same `extends:` entry works in production via giget — `install: true` will fetch the layer and run install for its declared deps.

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find package '<x>' imported from layers/<name>/...` | The layer imports `<x>` but doesn't declare it (and host doesn't either) | Add `<x>` to the layer's `package.json` — `dependencies` if it's layer-private, `peerDependencies` if it's a shared singleton (DB/framework) |
| `Cannot find package '<x>' imported from layers/<name>/...` (only fails under giget, not local) | Layer declares `<x>` only as a `peerDependency`, but host's `dependencies` doesn't carry it | Either add to host's `dependencies`, or move the package from peer to direct dep on the layer |
| `Failed to resolve import "~/assets/css/main.css"` from a virtual nuxt module | Host references a CSS file that lives in a layer; the `~/` alias points at the host's tree | Layer should declare its own CSS in its `nuxt.config.ts` (see [layers/core/nuxt.config.ts](../layers/core/nuxt.config.ts) for the pattern) |
| Dev seems to run but never finds layers; mentions `host/host/.nuxt` | `host/package.json` scripts have a stray `host` arg (`nuxt dev host` instead of `nuxt dev`) | Drop the arg; commands run with cwd `host/` |
| Migrations fail with DB connection errors | Postgres isn't running, or `DATABASE_URL` / `APP_DATABASE_URL` aren't set | Start Postgres and check `host/.env`. See [single-tenant-deploy.md](./single-tenant-deploy.md) for DB role setup |
| Build fails with `Failed to download https://api.github.com/repos/.../tarball/main: 404` | Running build with no `LAYERS_PATH` set, but the `LAYERS_REMOTE` repo isn't reachable | Set `LAYERS_PATH=../layers` in `host/.env` for local builds, or push the repo to the configured `LAYERS_REMOTE` |

## Production deploy summary

The `host/` directory is the deployable. In production:

- `LAYERS_PATH` is unset; layers come from git via giget.
- No workspace root, no sibling `layers/`. Just `host/`.
- Build: `bun install && bun run build` from inside `host/`. The `install: true` option in `extends:` triggers per-layer installs into `node_modules/.c12/<hash>/`.
- Run: standard Nuxt output under `.output/` — see Nuxt deployment docs for your target.

For full deployment guidance see [single-tenant-deploy.md](./single-tenant-deploy.md).
