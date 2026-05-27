import { downloadTemplate } from 'giget'

declare const process: { env: Record<string, string | undefined>, exit: (code: number) => never }

const REF = process.env.NUXTINATOR_REF || 'master'

const SUBPATH: Record<string, string> = {
  core: 'layers/core',
  tenancy: 'layers/tenancy',
  'email-mailgun': 'layers/email-mailgun',
  oauth: 'layers/oauth',
  mcp: 'layers/mcp',
  dev: 'layers/dev',
  calendar: 'layers/apps/calendar',
  feedback: 'layers/apps/feedback',
  kanban: 'layers/apps/kanban',
  'list-of-100': 'layers/apps/list-of-100',
  messages: 'layers/apps/messages',
  videos: 'layers/apps/videos'
}

// For the spike: pull core + email-mailgun. email-mailgun has a workspace:*
// cross-layer dep on core, which is exactly what we want to test under the
// workspaces pattern.
const SELECTED = ['core', 'email-mailgun']

for (const id of SELECTED) {
  if (!SUBPATH[id]) {
    console.error(`Unknown layer: ${id}`)
    process.exit(1)
  }
  const url = `github:corsacca/nuxtinator/${SUBPATH[id]}#${REF}`
  const dir = `_layers/${id}`
  console.log(`Fetching ${id} from ${url}`)
  await downloadTemplate(url, { dir, forceClean: true })
}

console.log(`\nFetched ${SELECTED.length} layers into _layers/`)
console.log(`Run 'bun install' to hoist their deps via workspaces.`)
