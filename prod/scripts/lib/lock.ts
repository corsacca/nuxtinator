// layers.lock.json — the resolved state of each layer.
//
// layers.ts declares *policy* (a range / 'latest' / a pin). This lock records
// the concrete tag each policy resolved to at the last `layers:update`. The
// build (sync-layers) reads the lock and fetches exactly those refs — it never
// re-resolves ranges — so deploys are reproducible (like `npm ci`). The lock is
// committed; a change to it is what makes Railpack bust its build cache and
// re-fetch on the next deploy.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  type LayerSpec,
  availableBeyondRange,
  listTags,
  repoOf,
  resolveRef,
  subdirOf,
  tagPrefixOf,
  versionOf
} from './resolve'

export const LOCK_FILE = 'layers.lock.json'

export type LockEntry = {
  pkg: string // package name (also what the in-app notifier displays)
  version: string // the declared policy (range / pin / 'latest' / ref) at resolve time
  ref: string // the concrete git ref the policy resolved to
  source: string // github:<repo>/<subdir> (ref-less) for readability
  tagPrefix: string // the tag namespace, so the notifier can list this layer's versions
}
export type Lock = Record<string, LockEntry>

export function readLock(): Lock | null {
  return existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : null
}

export function writeLock(lock: Lock): void {
  writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2) + '\n')
}

// Resolve every layer's declared policy against its source tags and build a
// fresh lock. Tags are listed once per unique repo. A global NUXTINATOR_REF env
// var (back-compat) overrides resolution for every layer at once.
export function resolveAll(layers: readonly LayerSpec[], token?: string): {
  lock: Lock
  beyond: Record<string, string> // id -> newest version held outside its range
} {
  const globalRef = process.env.NUXTINATOR_REF
  const tagsByRepo = new Map<string, string[]>()
  const tagsFor = (repo: string) => {
    if (!tagsByRepo.has(repo)) tagsByRepo.set(repo, listTags(repo, token))
    return tagsByRepo.get(repo)!
  }

  const lock: Lock = {}
  const beyond: Record<string, string> = {}
  for (const l of layers) {
    const source = `github:${repoOf(l)}/${subdirOf(l)}`
    const ref = globalRef ?? resolveRef(l, tagsFor(repoOf(l)))
    lock[l.id] = { pkg: l.pkg, version: globalRef ?? versionOf(l), ref, source, tagPrefix: tagPrefixOf(l) }
    if (!globalRef) {
      const held = availableBeyondRange(l, tagsFor(repoOf(l)))
      if (held) beyond[l.id] = held
    }
  }
  return { lock, beyond }
}
