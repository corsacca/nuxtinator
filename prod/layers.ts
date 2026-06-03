// Which nuxtinator layers this project uses.
//
// This file is the SINGLE SOURCE OF TRUTH for REMOTE layer selection — layers
// fetched from a git host into _layers/<id>/. Both nuxt.config.ts (the
// `extends:` array) and scripts/sync-layers.ts (the fetcher) read from it.
//
// YOUR OWN apps don't go here. Drop them in ./apps/<id>/ — nuxt.config.ts globs
// that directory into `extends`, so a new app loads with no entry in this file,
// no fetch, and no install step. See ./apps/README.md. Use this file only for
// layers pulled from a remote repo.
//
// Each entry has three fields:
//   id   — directory name under _layers/<id>/ (also the bare slug used in
//          the NUXTINATOR_<ID>_PATH env-var override)
//   pkg  — package name Nuxt's extends: resolves to. Must match the layer's
//          own package.json `name` field. For first-party layers this is
//          @nuxtinator/<id>; for third-party layers, whatever scope they use.
//   url  — a giget source: `github:owner/repo[/subdir][#ref]`,
//          `gitlab:owner/repo#ref`, `bitbucket:…`, `sourcehut:…`, or an
//          `https://…tarball.tar.gz`. giget has NO `file:` provider — for a
//          local app use ./apps/<id>/ (above), not a file: URL here.
//
// Load order matters. Keep core first; tenancy second so its multi-mode
// kernel overrides core's single-mode; email backend; oauth; mcp; app
// layers; dev last (remove dev before production build).

const REF = process.env.NUXTINATOR_REF || 'master'

export const LAYERS = [
  { id: 'core',            pkg: '@nuxtinator/core',           url: `github:corsacca/nuxtinator/layers/core#${REF}` },
  { id: 'tenancy',         pkg: '@nuxtinator/tenancy',        url: `github:corsacca/nuxtinator/layers/tenancy#${REF}` },
  { id: 'email-mailgun',   pkg: '@nuxtinator/email-mailgun',  url: `github:corsacca/nuxtinator/layers/email-mailgun#${REF}` },
  { id: 'oauth',           pkg: '@nuxtinator/oauth',          url: `github:corsacca/nuxtinator/layers/oauth#${REF}` },
  { id: 'mcp',             pkg: '@nuxtinator/mcp',            url: `github:corsacca/nuxtinator/layers/mcp#${REF}` },
  { id: 'calendar',        pkg: '@nuxtinator/calendar',       url: `github:corsacca/nuxtinator/layers/apps/calendar#${REF}` },
  { id: 'feedback',        pkg: '@nuxtinator/feedback',       url: `github:corsacca/nuxtinator/layers/apps/feedback#${REF}` },
  { id: 'kanban',          pkg: '@nuxtinator/kanban',         url: `github:corsacca/nuxtinator/layers/apps/kanban#${REF}` },
  { id: 'list-of-100',     pkg: '@nuxtinator/list-of-100',    url: `github:corsacca/nuxtinator/layers/apps/list-of-100#${REF}` },
  { id: 'messages',        pkg: '@nuxtinator/messages',       url: `github:corsacca/nuxtinator/layers/apps/messages#${REF}` },
  { id: 'videos',          pkg: '@nuxtinator/videos',         url: `github:corsacca/nuxtinator/layers/apps/videos#${REF}` },
  { id: 'files',           pkg: '@nuxtinator/files',          url: `github:corsacca/nuxtinator/layers/apps/files#${REF}` },
  { id: 'context',         pkg: '@nuxtinator/context',        url: `github:corsacca/nuxtinator/layers/apps/context#${REF}` },
  { id: 'dev',             pkg: '@nuxtinator/dev',            url: `github:corsacca/nuxtinator/layers/dev#${REF}` }

  // Example remote third-party layer (uncomment + edit to use). For your OWN
  // apps, use ./apps/<id>/ instead — see ./apps/README.md.
  // { id: 'contacts',     pkg: '@disciple-tools/contacts',   url: 'github:disciple-tools/contacts-layer#v0.5.0' }
] as const
