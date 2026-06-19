// Settings registry. The code-owned half of the shared settings store: each
// layer's Nitro plugin calls `registerSetting({...})` at boot to declare which
// settings exist, their defaults, and how to coerce stored values. The DB
// (`core_settings`) only ever holds explicit overrides — this registry is the
// source of truth for "what settings exist" and "what the default is", the same
// way `registerApp`/`registerPermissions` own the app and permission catalogs.
//
// Reads merge the two halves: a registered setting with no DB row resolves to
// its declared default; a DB row with no registration is an orphan and is
// ignored. See settings-store.ts for the merge.
//
// Namespacing: `namespace` is the owning layer's app id (e.g. 'feedback'). It
// keys the DB rows too, so two layers can't collide on a bare key. A duplicate
// registration of the same (namespace, key) is a bug (two declarations of one
// setting) — the first wins and a warning is logged rather than silently
// masking one with the other.

export interface SettingDef<T = unknown> {
  // Owning layer's app id. Combined with `key` to form the storage and lookup
  // identity.
  namespace: string
  // Setting identifier, unique within the namespace.
  key: string
  // Code-owned default, returned by reads when no override row exists. Never
  // written to the DB.
  default: T
  // Optional coercer/validator. Applied to the raw stored (or default) value on
  // read and to incoming values on write, so the jsonb blob is always
  // normalized to the setting's declared shape (e.g. sanitize a user-id list).
  parse?: (value: unknown) => T
  // Optional human label for admin / introspection surfaces. Resolved from
  // code, never persisted.
  label?: string
}

function settingId(namespace: string, key: string): string {
  return `${namespace}:${key}`
}

const _settings = new Map<string, SettingDef>()

export function registerSetting<T>(def: SettingDef<T>): void {
  if (!def || typeof def.namespace !== 'string' || def.namespace.length === 0) return
  if (typeof def.key !== 'string' || def.key.length === 0) return
  const id = settingId(def.namespace, def.key)
  if (_settings.has(id)) {
    console.warn(`[settings-registry] duplicate setting "${id}" ignored — first registration wins`)
    return
  }
  _settings.set(id, def as SettingDef)
}

// All registered settings, optionally filtered to one namespace. Drives the
// registry-first merge in settings-store.ts.
export function getRegisteredSettings(namespace?: string): SettingDef[] {
  const all = [..._settings.values()]
  return namespace ? all.filter(s => s.namespace === namespace) : all
}

export function getRegisteredSetting(namespace: string, key: string): SettingDef | null {
  return _settings.get(settingId(namespace, key)) ?? null
}

export function __resetSettingsRegistryForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetSettingsRegistryForTests is not callable in production')
  }
  _settings.clear()
}
