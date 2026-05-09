# Dev setup

How to get this repo running locally, and the moving parts that make it work.

## Quick start

```bash
git clone <this repo>
cd go-saas/host
bun install
ln -s ../host/node_modules ../layers/node_modules    # see "Why the symlink" below
cp .env.example .env                                  # then fill in DATABASE_URL etc.
bun run dev
```

Dev server: <http://localhost:2080>.

## Repo shape

```
go-saas/
├── host/              ← the Nuxt app shell. cwd for all dev/build commands.
│   ├── nuxt.config.ts
│   ├── package.json   ← the only package.json in the repo (today)
│   ├── node_modules/
│   └── .env, .env.example
└── layers/            ← reusable layers (siblings of host)
    ├── core/          ← always-on foundation
    ├── tenancy/       ← optional multi-tenant
    ├── email-mailgun/ ← optional email backend
    ├── oauth/, mcp/, dev/
    ├── apps/calendar/, apps/kanban/
    └── node_modules → ../host/node_modules    ← gitignored symlink, see below
```

Run all dev/build commands from `host/`:

```
bun run dev          # dev server (port 2080, runs migrations on boot)
bun run build        # prod build
bun run preview      # preview built app
bun run lint         # eslint
bun run typecheck    # vue-tsc / nuxt typecheck
```

## How layers are wired

[host/nuxt.config.ts](../host/nuxt.config.ts) builds its `extends:` array dynamically, so the same config works for local dev and for production deploys that fetch layers from git:

```ts
function layer(name: string) {
  if (LAYERS_PATH) return `${LAYERS_PATH}/${name}`
  return `${LAYERS_REMOTE}/${name}${LAYERS_REF}`
}

extends: [layer('core'), layer('tenancy'), layer('email-mailgun'), ...]
```

Three env vars control resolution:

| Var | When set | Effect |
|---|---|---|
| `LAYERS_PATH` | Dev (`host/.env` has `LAYERS_PATH=../layers`) | Each layer resolves to `${LAYERS_PATH}/<name>` — a local path |
| `LAYERS_REMOTE` | Falls back to `github:corsacca/go-saas/layers` baked into `nuxt.config.ts`. Set to override (e.g. fork) | Used when `LAYERS_PATH` is unset |
| `LAYERS_REF` | Optional | Appended as `#<ref>` to the remote URL (branch/tag/SHA) |

In production, `LAYERS_PATH` is unset, so Nuxt fetches each layer from `${LAYERS_REMOTE}/<name>${LAYERS_REF}` at install/build time via [giget](https://github.com/unjs/giget). Layers land in `host/node_modules/.c12/<hash>/`.

Downstream projects that copy this blueprint can either keep the same `LAYERS_REMOTE` (consume layers as-is) or fork the layers repo and override `LAYERS_REMOTE` in their `.env`.

## Why the symlink (`layers/node_modules → ../host/node_modules`)

Currently every layer's runtime/build deps live in `host/package.json`. When a layer file does `import { Migrator } from 'kysely'`, Node walks up from that file's directory looking for `node_modules/kysely/`. From a layer file at `layers/core/migrations/001_create_users.ts` the walk goes:

```
layers/core/migrations/node_modules   ← doesn't exist
layers/core/node_modules              ← doesn't exist
layers/node_modules                   ← SYMLINK → host/node_modules ✓
```

Without the symlink, the walk continues past the repo and never reaches `host/node_modules` (Node only walks parents, not siblings). Build-time imports of `@nuxt/kit` (CJS) and runtime ESM imports of `kysely`/`bcrypt`/etc. all fail.

Production doesn't need this — giget fetches each layer *into* `host/node_modules/.c12/...`, so the upward walk naturally hits `host/node_modules`.

The symlink is gitignored (everything called `node_modules` is). Every fresh clone needs it created once.

### Optional: automate via postinstall

To save the manual step, fold it into `host/package.json`:

```json
{
  "scripts": {
    "postinstall": "node -e \"import('node:fs').then(f => f.existsSync('../layers/node_modules') || f.symlinkSync('../host/node_modules', '../layers/node_modules', 'dir'))\" && nuxt prepare"
  }
}
```

Cross-platform note: `symlinkSync` works on macOS/Linux without privileges. On Windows, directory symlinks require admin or developer mode — devs there may need to run the link command manually.

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module '@nuxt/kit'` (require stack starts in a `layers/<name>/` file) | `layers/node_modules` symlink missing | `ln -s ../host/node_modules layers/node_modules` from repo root |
| `Cannot find package 'kysely' imported from layers/...` | Same as above (ESM variant) | Same fix |
| `Failed to resolve import "~/assets/css/main.css"` from a virtual nuxt module | Host references a CSS file that lives in a layer; the `~/` alias points at the host's tree | Layer should declare its own CSS in its `nuxt.config.ts` (see [layers/core/nuxt.config.ts](../layers/core/nuxt.config.ts) for the pattern) |
| Dev seems to run but never finds layers; mentions `host/host/.nuxt` | `host/package.json` scripts have a stray `host` arg (`nuxt dev host` instead of `nuxt dev`) | Drop the arg; commands run with cwd `host/` |
| Migrations fail with DB connection errors | Postgres isn't running, or `DATABASE_URL` / `APP_DATABASE_URL` aren't set | Start Postgres and check `host/.env`. See [single-tenant-deploy.md](./single-tenant-deploy.md) for DB role setup |

## What's planned but not built yet

The current setup uses **option A** — one `host/package.json`, all deps centralized, the layer-to-host symlink as the dev-only bridge. This works as long as all layers live as siblings under one parent dir.

The intended end state is **option E** — each layer is a self-contained package with its own `package.json` and `node_modules`. Dev and prod become structurally identical (each layer resolves its own deps), the symlink goes away, and individual layers can move to separate git repos without further restructuring. Migration plan: [docs/dev-structure/option-e-self-contained-layers.md](../docs/dev-structure/option-e-self-contained-layers.md).

Until that migration happens, the symlink + central `host/package.json` is the contract.

## Production deploy summary

The `host/` directory is the deployable. In production:

- `LAYERS_PATH` is unset; layers come from git via giget.
- No `host/host/` parent, no sibling `layers/`. Just `host/`.
- Build: `bun install && bun run build` from inside `host/`.
- Run: standard Nuxt output under `.output/` — see Nuxt deployment docs for your target.

For full deployment guidance see [single-tenant-deploy.md](./single-tenant-deploy.md).
