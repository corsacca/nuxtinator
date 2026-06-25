// Per-layer version resolution for layers.ts.
//
// giget and Nuxt's `extends:` understand only a literal git ref (branch, tag,
// or SHA) — they have no semver. So each layer's declared `version` (a range,
// an exact pin, 'latest', or a raw ref) is resolved against the source repo's
// tags HERE, and the concrete tag is handed to giget. Tags are namespaced per
// layer (`@nuxtinator/<id>@1.4.0`) because every first-party layer shares one
// repo's tag namespace; the prefix is how one layer's version line is picked
// out of the shared set.

import { execSync } from 'node:child_process'
import semver from 'semver'

export type LayerSpec = {
  id: string
  pkg: string
  repo?: string // owner/name of the source repo; defaults to DEFAULT_REPO
  subdir?: string // path to the layer inside the repo; defaults to `layers/<id>`
  tagPrefix?: string // tag namespace; defaults to `@nuxtinator/<id>@`
  version?: string // 'latest' | semver range | exact semver | raw ref. Default 'latest'.
}

export const DEFAULT_REPO = 'corsacca/nuxtinator'

export const repoOf = (l: LayerSpec) => l.repo ?? DEFAULT_REPO
export const subdirOf = (l: LayerSpec) => l.subdir ?? `layers/${l.id}`
export const tagPrefixOf = (l: LayerSpec) => l.tagPrefix ?? `@nuxtinator/${l.id}@`
export const versionOf = (l: LayerSpec) => l.version ?? 'latest'

// List a repo's tag names. `git ls-remote` needs no API token and isn't rate
// limited; a token (for a private source) is injected into the clone URL.
// `--refs` drops the dereferenced `^{}` peeled entries.
export function listTags(repo: string, token?: string): string[] {
  const auth = token ? `${token}@` : ''
  const out = execSync(
    `git ls-remote --tags --refs https://${auth}github.com/${repo}.git`,
    { encoding: 'utf8' }
  )
  return out
    .split('\n')
    .map(line => line.split('refs/tags/')[1])
    .filter((t): t is string => Boolean(t))
}

// The semver versions a layer has released, mapped back to the full tag name so
// the prefix can be re-attached after a bare-semver comparison.
function layerVersions(spec: LayerSpec, tags: string[]): Map<string, string> {
  const prefix = tagPrefixOf(spec)
  const map = new Map<string, string>() // bare semver -> full tag name
  for (const t of tags) {
    if (!t.startsWith(prefix)) continue
    const bare = semver.valid(t.slice(prefix.length))
    if (bare) map.set(bare, t)
  }
  return map
}

// Resolve a layer's `version` policy to a concrete git ref giget can fetch.
export function resolveRef(spec: LayerSpec, tags: string[]): string {
  const v = versionOf(spec)
  const versions = layerVersions(spec, tags)

  // 'latest' / omitted -> newest released tag, or `master` when none exist yet
  // (this is what preserves today's track-master behaviour before any tags).
  if (v === 'latest' || v === '') {
    const newest = semver.rsort([...versions.keys()])[0]
    return newest ? versions.get(newest)! : 'master'
  }

  // exact pin -> that tag (must exist)
  if (semver.valid(v)) {
    const tag = versions.get(v)
    if (!tag) throw new Error(`${spec.id}: no tag ${tagPrefixOf(spec)}${v}`)
    return tag
  }

  // range -> highest tag satisfying it
  if (semver.validRange(v)) {
    const best = semver.maxSatisfying([...versions.keys()], v)
    if (!best) {
      throw new Error(
        `${spec.id}: no ${tagPrefixOf(spec)}* tag satisfies "${v}" `
        + `(available: ${[...versions.keys()].join(', ') || 'none'})`
      )
    }
    return versions.get(best)!
  }

  // raw branch / SHA -> passthrough
  return v
}

// The newest released version that sits OUTSIDE a layer's range (i.e. a held
// major), for surfacing "an update exists but needs a range bump". Returns null
// when the range already covers the newest, or when `version` is not a range.
export function availableBeyondRange(spec: LayerSpec, tags: string[]): string | null {
  const v = versionOf(spec)
  if (!semver.validRange(v) || semver.valid(v)) return null
  const newest = semver.rsort([...layerVersions(spec, tags).keys()])[0]
  if (!newest) return null
  return semver.satisfies(newest, v) ? null : newest
}
