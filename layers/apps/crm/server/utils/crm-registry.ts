// In-process CRM registries — the code-owned side of every merged definition
// read. Same idiom as core's permissions registry: module-level maps fed by
// each layer's Nitro plugin at boot; registering the same key again
// overwrites, so repeated plugin runs stay idempotent. Future layers (email
// inbox, marketing, forms) extend the CRM by calling these from their own
// plugins.

import type { CrmRecordTypeManifest } from '#crm'
import type { TenantContext } from '#tenant/server'
import type { ChannelValueFormat } from '../database/schema.d'

// --- Record types ----------------------------------------------------------

const _recordTypes = new Map<string, CrmRecordTypeManifest>()

export function registerCrmRecordType(manifest: CrmRecordTypeManifest): void {
  _recordTypes.set(manifest.key, manifest)
}

export function getRegisteredRecordTypes(): CrmRecordTypeManifest[] {
  return [..._recordTypes.values()]
}

export function getRegisteredRecordType(key: string): CrmRecordTypeManifest | undefined {
  return _recordTypes.get(key)
}

// --- Channel types ---------------------------------------------------------

export interface CrmChannelTypeEntry {
  typeKey: string
  label: string
  icon?: string
  valueFormat: ChannelValueFormat
}

const _channelTypes = new Map<string, CrmChannelTypeEntry>()

export function registerCrmChannelType(entry: CrmChannelTypeEntry): void {
  _channelTypes.set(entry.typeKey, entry)
}

export function getRegisteredChannelTypes(): CrmChannelTypeEntry[] {
  return [..._channelTypes.values()]
}

// --- Consent purposes ------------------------------------------------------

export interface CrmConsentPurposeMeta {
  title: string
  description?: string
}

const _consentPurposes = new Map<string, CrmConsentPurposeMeta>()

export function registerCrmConsentPurpose(key: string, meta: CrmConsentPurposeMeta): void {
  _consentPurposes.set(key, meta)
}

export function getRegisteredConsentPurposes(): Array<{ key: string } & CrmConsentPurposeMeta> {
  return [..._consentPurposes.entries()].map(([key, meta]) => ({ key, ...meta }))
}

// --- Field-filter hook chain -----------------------------------------------
//
// The dt_post_create_fields analogue: filters run sequentially inside
// applyFieldPatch before validation. Each filter receives the previous
// filter's output and returns the (possibly rewritten) patch.

export type CrmFieldPatch = Record<string, unknown>

export type CrmFieldFilterPhase = 'create' | 'update'

export type CrmFieldFilter = (
  patch: CrmFieldPatch,
  ctx: TenantContext,
  typeKey: string
) => CrmFieldPatch | Promise<CrmFieldPatch>

const _fieldFilters: Record<CrmFieldFilterPhase, CrmFieldFilter[]> = {
  create: [],
  update: []
}

export function registerCrmFieldFilter(phase: CrmFieldFilterPhase, fn: CrmFieldFilter): void {
  if (!_fieldFilters[phase].includes(fn)) _fieldFilters[phase].push(fn)
}

export async function runCrmFieldFilters(
  phase: CrmFieldFilterPhase,
  patch: CrmFieldPatch,
  ctx: TenantContext,
  typeKey: string
): Promise<CrmFieldPatch> {
  let current = patch
  for (const fn of _fieldFilters[phase]) {
    current = await fn(current, ctx, typeKey)
  }
  return current
}

export function __resetCrmRegistriesForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__resetCrmRegistriesForTests is not callable in production')
  }
  _recordTypes.clear()
  _channelTypes.clear()
  _consentPurposes.clear()
  _fieldFilters.create = []
  _fieldFilters.update = []
}
