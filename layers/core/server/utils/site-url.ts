import { useRuntimeConfig, createError } from '#imports'

// Canonical site origin from `runtimeConfig.public.siteUrl` (NUXT_PUBLIC_SITE_URL).
// Never falls back to the request's Host header — that header is attacker-
// controlled on unauthenticated endpoints (forgot-password, register), and a
// fallback there allows an attacker to make the server email victims a link
// pointing at attacker-controlled infrastructure, leaking reset/invite tokens.
export function getSiteUrl(): string {
  const cfg = useRuntimeConfig()
  const raw = (cfg.public as { siteUrl?: string }).siteUrl
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Server misconfigured: NUXT_PUBLIC_SITE_URL is required to send links'
    })
  }
  return raw.replace(/\/$/, '')
}
