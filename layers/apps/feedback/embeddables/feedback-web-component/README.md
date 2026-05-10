# `<feedback-web-component>`

A single-file Vue IIFE web component. One `<script>` tag on any site drops a feedback capture widget in the corner; every submission lands as a Kanban card in a central project.

This is the first widget built on the **monorepo + self-hosted CDN** pattern used across `TOOL-kanban-nuxt`. If you're adding a second web component, this folder is the reference implementation.

![Feedback Web Component Architecture](docs/feedback-web-component-architecture.svg)

## The big picture

```
TOOL-kanban-nuxt/                              ← Nuxt app (Railway-hosted)
├── embeddables/
│   └── web-components/
│       └── feedback-web-component/            ← you are here (self-contained sub-project)
│           ├── src/                           ← Vue source (entry.js, stores, composables, profiles)
│           ├── vite.config.js                 ← builds to ../../../public/js/ + ./app/
│           ├── index.html                     ← local dev tester
│           └── app/feedback-web-component.iife.js    ← build output #1 (for the tester)
└── public/
    └── js/feedback-web-component.iife.js     ← build output #2 (served by Nuxt → CDN URL)
```

Consumers anywhere on the internet embed the widget with a single `<script src="https://<your-nuxt-host>/js/feedback-web-component.iife.js">`. See [docs/EMBEDDING.md](docs/EMBEDDING.md) for the full consumer-facing guide.

## Why this pattern

**Monorepo sub-project.** Each web component is a self-contained folder (own `package.json`, own `vite.config.js`, own `node_modules`) nested inside the Nuxt app that serves it. Source + build config live next to the thing that hosts them, but the build toolchain stays isolated.

**Self-hosted CDN.** The Vite config's `outDir` points at the parent Nuxt's `public/js/` folder. When Railway rebuilds the Nuxt app, the widget rebuilds too (via the root `bun run build` chain), and the fresh bundle is served at `https://<host>/js/feedback-web-component.iife.js`. No S3, no third-party CDN, no separate deploy pipeline.

**Module federation via script tag.** Every external site that embeds the widget loads the same live URL. When you push a change to the monorepo, every consumer picks up the new bundle on the next cache revalidation. One source of truth, zero-touch propagation — the core benefit other teams reach for Webpack Module Federation or React Server Components to get, achieved with a `<script>` tag + custom element.

**Single-file IIFE, CSS inlined.** One file on disk, one URL for consumers to embed, no CSS/JS version skew possible.

## Dev workflow

```bash
# from this folder
bun install
bun run build           # builds to ./app/ AND ../../../public/js/
bun run build:watch     # rebuilds on every src/ change
```

Then open [index.html](index.html) in a browser — it's a self-contained tester that loads the bundle from `./app/feedback-web-component.iife.js` and lets you paste any `apiBase` URL to test against a real Kanban backend.

**Two build outputs, same bytes:**
- `./app/feedback-web-component.iife.js` — for the local tester above
- `../../../public/js/feedback-web-component.iife.js` — served by the parent Nuxt app (the "real" public URL)

The `public/js/` output is what makes the CDN pattern work. The `./app/` output is an optional local-dev convenience — if you removed the `copy-to-app-dir` plugin in `vite.config.js` and pointed `index.html` at the `public/js/` path instead, nothing would break.

## Inside the bundle

- **`src/entry.js`** — registers the `<feedback-web-component>` custom element, injects the `.feedback-widget-slot` wrapper CSS into `<head>` on load.
- **`src/ProfileLoader.vue`** — root component that reads the `profile-config` attribute (JSON string) and mounts the chosen profile.
- **`src/app-profiles/`** — one Vue component per UI profile. `chat-bubble.vue` is the default floating-bubble UI.
- **`src/stores/authStore.js`** — Pinia store for login state. `localStorage`-mirrored so sibling instances on the same origin share auth without re-logging-in.
- **`src/composables/`** — `useApi.js` (fetch wrapper + Bearer token), `useFeedback.js` (submission logic, cross-instance token sync).
- **`slot.css`** — `.feedback-widget-slot` positioning rules. Inlined into the JS bundle at build time via `?raw` import.

Architecture diagram: [docs/feedback-web-component-architecture.svg](docs/feedback-web-component-architecture.svg)

## Adding a new web component

Copy this folder, rename, update three things:
1. `package.json` `name` field
2. `vite.config.js` `lib.name` (IIFE global) and `lib.fileName` (output filename)
3. `src/entry.js` `customElements.define('<your-tag>', ...)`

Then wire the build into the root [../../../package.json](../../../package.json) scripts alongside `build:feedback-web-component`. The root `build:widgets` script chains all web-component builds before `nuxt build` runs.

## Where feedback lands

Every submission becomes a card in the Kanban project whose UUID is passed as `projectId`, starting in the `FEEDBACK INBOX` column. Humans triage in the Kanban UI; agents triage via the MCP tools (`feedback_list`, `feedback_load`, `feedback_accept`, `feedback_reject`, `feedback_triage_needed`).

## Hidden-by-default mode

Embedders can pass `"showByDefault": false` in `profile-config` to keep the widget invisible for ordinary visitors. Anyone who loads the host page with `?feedback` in the URL gets the flag persisted to `localStorage["show-feedback-widget"]` and sees the widget from then on. Useful for internal testers, beta cohorts, or customers you've sent a feedback link to. Full details and examples in [docs/EMBEDDING.md](docs/EMBEDDING.md).

## See also

- **[docs/EMBEDDING.md](docs/EMBEDDING.md)** — how external sites consume the widget via URL
- **[index.html](index.html)** — local dev tester (runs after `bun run build`)
- **[docs/feedback-web-component-architecture.svg](docs/feedback-web-component-architecture.svg)** — runtime architecture diagram
