// Inline-image intake for the composer. Images are magic-byte sniffed (never
// trust the browser Content-Type — a .png-named HTML/SVG must be rejected),
// stored in the PRIVATE bucket under `inbox-inline/<orgSegment>/<hex>.<ext>`,
// and served back only through the authenticated proxy. They are never tracked
// in the DB — abandoned composer images orphan by design.

export const INBOX_INLINE_MAX_BYTES = 10 * 1024 * 1024
export const INBOX_INLINE_PREFIX = 'inbox-inline'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
}
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
}

// Sniff a supported image type from the leading bytes, or null. Only
// JPEG/PNG/GIF/WebP are accepted — the one attachment class allowed to render
// inline in the app origin, so the type must be proven, not declared.
export function inboxSniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
    && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) return 'image/png'
  // GIF: "GIF87a" / "GIF89a"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
    && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif'
  // WebP: "RIFF"...."WEBP"
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  return null
}

export function inboxInlineExtForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null
}

// The serving content-type is derived from the key's extension, safe ONLY
// because upload sniffed the bytes to that type.
export function inboxInlineMimeForKey(key: string): string | null {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? null
}

// A valid inline-image object key: the right prefix and no path traversal.
// Without this the proxy would be a read-any-key oracle into the private
// bucket (raw .eml, every attachment).
export function inboxIsInlineImageKey(key: string): boolean {
  return key.startsWith(`${INBOX_INLINE_PREFIX}/`) && !key.includes('..')
}

// The org namespace segment of a key (`inbox-inline/<seg>/<hex>.<ext>`).
export function inboxInlineKeyOrgSegment(key: string): string | null {
  return key.split('/')[1] ?? null
}
