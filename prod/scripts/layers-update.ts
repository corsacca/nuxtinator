// Check each layer's source for newer versions and (re)write layers.lock.json.
//
//   bun run layers:check    dry run — report what would change
//   bun run layers:update   apply — write the lock (this is `layers:check --write`)
//
// The scheduled GitHub Action runs `layers:update` and opens a PR with the
// resulting lockfile change. In-range minor/patch updates move the lock with the
// range untouched — those are the auto-mergeable PRs. A newer MAJOR outside the
// range is reported but NOT applied: adopting it is a deliberate range bump in
// layers.ts (a change held for a human).

import { LAYERS } from '../layers'
import { readLock, resolveAll, writeLock } from './lib/lock'

const write = process.argv.includes('--write')
const token = process.env.LAYER_SOURCE_TOKEN

const before = readLock() ?? {}
const { lock, beyond } = resolveAll(LAYERS, token)

const changed = Object.keys(lock)
  .filter(id => before[id]?.ref !== lock[id].ref)
  .map(id => `  ${id}: ${before[id]?.ref ?? '(none)'} -> ${lock[id].ref}`)

console.log(changed.length ? `Updates in range:\n${changed.join('\n')}` : 'All layers up to date within their declared ranges.')

const held = Object.entries(beyond)
if (held.length) {
  console.log('\nMajor updates available (held — widen the range in layers.ts to adopt):')
  held.forEach(([id, v]) => console.log(`  ${id}: ${v} is newer than the pinned range`))
}

if (write) {
  writeLock(lock)
  console.log(`\nWrote layers.lock.json (${changed.length} change(s)).`)
} else if (changed.length) {
  console.log('\n(dry run — run `bun run layers:update` to write the lock)')
}
