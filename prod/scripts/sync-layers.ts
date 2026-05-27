import { downloadTemplate } from 'giget'

const REF = process.env.NUXTINATOR_REF || 'master'

// Each entry is { id → giget source URL }. The id is the directory name under
// _layers/<id>/; it doesn't have to match the layer's package name.
//
// Anything giget accepts goes on the right: `github:owner/repo[/subdir][#ref]`,
// `gitlab:...`, `bitbucket:...`, `https://...tarball`, or `file:./local-path` for
// in-development checkouts. Mix sources freely — the recipe doesn't care which
// repo a layer comes from, only what its package.json `name` resolves to.
//
// Trim this map to the layers your project actually uses. Each entry here must
// match (by package name) a layer('@nuxtinator/<id>') call in nuxt.config.ts's
// `extends:` array.
const LAYERS: Record<string, string> = {
  core:             `github:corsacca/nuxtinator/layers/core#${REF}`,
  tenancy:          `github:corsacca/nuxtinator/layers/tenancy#${REF}`,
  'email-mailgun':  `github:corsacca/nuxtinator/layers/email-mailgun#${REF}`,
  oauth:            `github:corsacca/nuxtinator/layers/oauth#${REF}`,
  mcp:              `github:corsacca/nuxtinator/layers/mcp#${REF}`,
  calendar:         `github:corsacca/nuxtinator/layers/apps/calendar#${REF}`,
  feedback:         `github:corsacca/nuxtinator/layers/apps/feedback#${REF}`,
  kanban:           `github:corsacca/nuxtinator/layers/apps/kanban#${REF}`,
  'list-of-100':    `github:corsacca/nuxtinator/layers/apps/list-of-100#${REF}`,
  messages:         `github:corsacca/nuxtinator/layers/apps/messages#${REF}`,
  videos:           `github:corsacca/nuxtinator/layers/apps/videos#${REF}`,
  dev:              `github:corsacca/nuxtinator/layers/dev#${REF}`
}

for (const [id, url] of Object.entries(LAYERS)) {
  console.log(`Fetching ${id} from ${url}`)
  await downloadTemplate(url, { dir: `_layers/${id}`, forceClean: true })
}

console.log(`\nFetched ${Object.keys(LAYERS).length} layers. Run 'bun install' to hoist their deps via workspaces.`)
