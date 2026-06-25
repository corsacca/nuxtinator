import { downloadTemplate } from 'giget'
import { LAYERS } from '../layers'
import { repoOf, subdirOf } from './lib/resolve'
import { readLock, resolveAll, writeLock } from './lib/lock'

// Fetch each selected layer into _layers/<id>/.
//
// Resolution (a range / 'latest' -> a concrete tag) is NOT done here — that's
// layers:update's job, and it records the result in layers.lock.json. This step
// just reads the lock and fetches the exact ref it pins, like `npm ci`, so a
// build is reproducible. On a first run with no lock (e.g. a fresh `bun run
// setup`), resolve once and write it so setup still works unattended — with no
// tags in the source yet, every layer resolves to `master`, i.e. today's behaviour.

let lock = readLock()
if (!lock) {
  console.log('No layers.lock.json — resolving once from layers.ts…')
  lock = resolveAll(LAYERS, process.env.LAYER_SOURCE_TOKEN).lock
  writeLock(lock)
}

for (const l of LAYERS) {
  const ref = lock[l.id]?.ref ?? 'master'
  const url = `github:${repoOf(l)}/${subdirOf(l)}#${ref}`
  console.log(`Fetching ${l.id} @ ${ref}`)
  await downloadTemplate(url, { dir: `_layers/${l.id}`, forceClean: true })
}

console.log(`\nFetched ${LAYERS.length} layers. Run 'bun install' to hoist their deps via workspaces.`)
