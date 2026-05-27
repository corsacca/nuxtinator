import { downloadTemplate } from 'giget'
import { LAYERS } from '../layers'

// Source of truth for which layers this project uses is ../layers.ts.
// This script just iterates that list and fetches each one via giget into
// _layers/<id>/. After fetching, run `bun install` to hoist their deps via
// the workspaces glob in package.json. The setup script chains both.

for (const { id, url } of LAYERS) {
  console.log(`Fetching ${id} from ${url}`)
  await downloadTemplate(url, { dir: `_layers/${id}`, forceClean: true })
}

console.log(`\nFetched ${LAYERS.length} layers. Run 'bun install' to hoist their deps via workspaces.`)
