// Which nuxtinator layers this project uses.
//
// This file is the SINGLE SOURCE OF TRUTH for layer selection. Both
// nuxt.config.ts (the `extends:` array) and scripts/sync-layers.ts (the
// fetcher) read from it. To add or remove a layer, edit this file only.
//
// Each entry has three fields:
//   id   — directory name under _layers/<id>/ (also the bare slug used in
//          the NUXTINATOR_<ID>_PATH env-var override)
//   pkg  — package name Nuxt's extends: resolves to. Must match the layer's
//          own package.json `name` field. For first-party layers this is
//          @nuxtinator/<id>; for third-party layers, whatever scope they use.
//   url  — anything giget accepts: `github:owner/repo[/subdir][#ref]`,
//          `gitlab:owner/repo#ref`, `https://...tarball.tar.gz`, or
//          `file:./local-checkout` for an in-development sibling.
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
  { id: 'dev',             pkg: '@nuxtinator/dev',            url: `github:corsacca/nuxtinator/layers/dev#${REF}` }

  // Example third-party / sibling-checkout entries (uncomment + edit to use):
  // { id: 'contacts',     pkg: '@disciple-tools/contacts',   url: 'github:disciple-tools/contacts-layer#v0.5.0' },
  // { id: 'my-experiment',pkg: '@me/my-experiment',          url: 'file:../my-experiment-layer' }
] as const
