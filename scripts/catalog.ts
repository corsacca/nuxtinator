// Layer catalog assembler.
//
// Assembles an in-memory view of the layer roster by READING each layer's own
// package.json from disk — it never hand-authors per-layer facts in one central
// place. That is the design rule that lets the same assembler work whether the
// layers are workspace symlinks in this monorepo (dev/) or giget-fetched copies
// under _layers/<id>/ in a consumer (prod/): the source path differs, the reader
// does not. Per-layer facts (name, version, requires) travel WITH the layer;
// only the SELECTION (which layers, what order) lives with the host roster.
//
// Consumed by scripts/verify-layers.ts (the roster doctor). Kept dependency-free
// and host-parameterized so prod/ can reuse it against _layers/* later.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface RosterEntry {
  id: string
  pkg: string
  url?: string
}

export interface WorkspacePkg {
  /** absolute path to the workspace directory */
  dir: string
  /** package.json "name", or null if absent */
  name: string | null
  json: Record<string, unknown>
}

export interface LayerFacts {
  id: string
  /** package name as declared in the host roster (layers.ts) */
  pkg: string
  /** "name" field of the resolved layer package.json, or null if unresolved */
  declaredName: string | null
  /** absolute path to the layer on disk, or null if no workspace matched */
  dir: string | null
  version: string | null
  private: boolean
  /** @nuxtinator/* package names this layer depends on (deps + optionalDeps) */
  requires: string[]
  hasApp: boolean
  hasServer: boolean
  hasMigrations: boolean
  hasSeeds: boolean
}

export interface Catalog {
  roster: RosterEntry[]
  /** layer facts, one per roster entry, in roster order */
  layers: LayerFacts[]
  /** every workspace package.json keyed by its "name" */
  byName: Map<string, WorkspacePkg>
  /** absolute layer dirs keyed by package name (for escape-import resolution) */
  dirByName: Map<string, string>
}

export function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Dynamically import the LAYERS array out of a dev/ or prod/ layers.ts file. */
export async function loadRoster(rosterPath: string): Promise<RosterEntry[]> {
  const mod = await import(pathToFileURL(rosterPath).href)
  if (!Array.isArray(mod.LAYERS)) {
    throw new Error(`${rosterPath} does not export a LAYERS array`)
  }
  return mod.LAYERS as RosterEntry[]
}

/** Read every workspace package.json, keyed by its declared "name". */
export function loadWorkspaces(repoRoot: string, workspaces: string[]): Map<string, WorkspacePkg> {
  const byName = new Map<string, WorkspacePkg>()
  for (const ws of workspaces) {
    const dir = resolve(repoRoot, ws)
    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) continue
    const json = readJson(pkgPath)
    const name = typeof json.name === 'string' ? json.name : null
    if (name) byName.set(name, { dir, name, json })
  }
  return byName
}

function depKeys(json: Record<string, unknown>, field: string): string[] {
  const v = json[field]
  return v && typeof v === 'object' ? Object.keys(v as Record<string, unknown>) : []
}

/**
 * Build the catalog: join the host roster against the workspace package.jsons,
 * deriving per-layer facts from each layer's own manifest + on-disk layout.
 */
export function assembleCatalog(
  roster: RosterEntry[],
  byName: Map<string, WorkspacePkg>
): Catalog {
  const layers: LayerFacts[] = roster.map((entry) => {
    const ws = byName.get(entry.pkg) ?? null
    const json = ws?.json ?? {}
    const requires = [...depKeys(json, 'dependencies'), ...depKeys(json, 'optionalDependencies')]
      .filter((k) => k.startsWith('@nuxtinator/'))
    const dir = ws?.dir ?? null
    return {
      id: entry.id,
      pkg: entry.pkg,
      declaredName: ws?.name ?? null,
      dir,
      version: typeof json.version === 'string' ? json.version : null,
      private: json.private === true,
      requires,
      hasApp: dir ? existsSync(join(dir, 'app')) : false,
      hasServer: dir ? existsSync(join(dir, 'server')) : false,
      hasMigrations: dir ? existsSync(join(dir, 'migrations')) : false,
      hasSeeds: dir ? existsSync(join(dir, 'seeds')) : false
    }
  })

  const dirByName = new Map<string, string>()
  for (const ws of byName.values()) {
    if (ws.name) dirByName.set(ws.name, ws.dir)
  }

  return { roster, layers, byName, dirByName }
}

/**
 * Find candidate layer directories on disk that look like layers (have a
 * package.json or an app/ dir) so the doctor can flag orphans not in any
 * roster/workspace. Scans `layers/` and `layers/apps/` one level deep.
 */
export function scanLayerDirs(repoRoot: string): string[] {
  const found: string[] = []
  const roots = [join(repoRoot, 'layers'), join(repoRoot, 'layers', 'apps')]
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const name of readdirSync(root)) {
      if (name === 'apps') continue // descended into separately
      const dir = join(root, name)
      if (!statSync(dir).isDirectory()) continue
      if (existsSync(join(dir, 'package.json')) || existsSync(join(dir, 'app')) || existsSync(join(dir, 'nuxt.config.ts'))) {
        found.push(dir)
      }
    }
  }
  return found
}
