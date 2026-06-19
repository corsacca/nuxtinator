// Read/write access to the shared settings store. The DB-backed half of the
// settings pattern (the code-owned half is settings-registry.ts). Built on
// `defineSettings` so it shares the registry-first merge rule with the rest of
// the app: code declares what exists + the default, the `core_settings` table
// holds only overrides, reads merge the two.
//
// Org scoping is transparent. In multi-tenant mode `core_settings` is RLS-
// scoped to the active org (set by `defineTenantHandler` / `withOrgPermission`
// inside the request transaction), so a plain `WHERE namespace = …` query
// already returns just this org's rows and inserts default `org_id` to the
// active org. In single-tenant mode there is no org column and the store is
// deployment-global. Callers pass the request `tx` and never touch org_id.

import { sql } from 'kysely'
import { defineSettings, type DbClient, type SettingsReader } from './settings'
import { getRegisteredSetting, getRegisteredSettings, type SettingDef } from './settings-registry'

interface SettingRow {
  key: string
  value: unknown
}

export interface SettingValue {
  key: string
  value: unknown
}

// Every registered setting in a namespace, merged with its DB override (or its
// declared default when no row exists). Unregistered DB rows are ignored
// (`includeOrphans` left false). The canonical `defineSettings` usage for this
// store; single-key callers should prefer `getSetting`.
export function settingsReader(namespace: string): SettingsReader<SettingValue> {
  return defineSettings<SettingDef, SettingRow, SettingValue>({
    loadDefaults: () => getRegisteredSettings(namespace),
    loadOverrides: async (tx) => {
      const rows = await tx
        .selectFrom('core_settings')
        .select(['key', 'value'])
        .where('namespace', '=', namespace)
        .execute()
      return new Map(rows.map(r => [r.key, r as SettingRow]))
    },
    keyOf: def => def.key,
    merge: (def, row) => {
      const raw = row ? row.value : def!.default
      return { key: def!.key, value: def!.parse ? def!.parse(raw) : raw }
    }
  })
}

// One setting's effective value: the override row if present, else the declared
// default, coerced through `parse`. Throws if the setting isn't registered —
// the store never serves arbitrary keys, which is what keeps it an override
// store rather than a free-for-all blob.
export async function getSetting<T = unknown>(
  tx: DbClient,
  namespace: string,
  key: string
): Promise<T> {
  const def = requireSetting(namespace, key)
  const row = await tx
    .selectFrom('core_settings')
    .select('value')
    .where('namespace', '=', namespace)
    .where('key', '=', key)
    .executeTakeFirst()
  const raw = row ? row.value : def.default
  return (def.parse ? def.parse(raw) : raw) as T
}

// Persist an override for one setting. The value is coerced through the
// registered `parse` before storage and written as jsonb via an explicit cast
// (postgres-js would otherwise mis-encode bare strings/arrays into the jsonb
// column). Read-then-write keeps this mode-agnostic: the unique key is
// `(namespace, key)` in single mode but `(org_id, namespace, key)` in multi
// mode, so there's no single ON CONFLICT target valid in both — and RLS already
// scopes the read/write to the active org.
export async function setSetting(
  tx: DbClient,
  namespace: string,
  key: string,
  value: unknown
): Promise<void> {
  const def = requireSetting(namespace, key)
  const parsed = def.parse ? def.parse(value) : value
  const json = sql`${JSON.stringify(parsed ?? null)}::jsonb`

  const existing = await tx
    .selectFrom('core_settings')
    .select('id')
    .where('namespace', '=', namespace)
    .where('key', '=', key)
    .executeTakeFirst()

  if (existing) {
    await tx
      .updateTable('core_settings')
      .set({ value: json, updated_at: sql`now()` })
      .where('namespace', '=', namespace)
      .where('key', '=', key)
      .execute()
  } else {
    await tx
      .insertInto('core_settings')
      .values({ namespace, key, value: json })
      .execute()
  }
}

function requireSetting(namespace: string, key: string): SettingDef {
  const def = getRegisteredSetting(namespace, key)
  if (!def) {
    throw new Error(
      `[settings] "${namespace}:${key}" is not registered — declare it with registerSetting() in a layer plugin`
    )
  }
  return def
}
