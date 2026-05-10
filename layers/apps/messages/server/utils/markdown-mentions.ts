// Mention parsing for markdown bodies. The wire format is
//   [@DisplayName](user-uuid)
// where the user-id is a UUID. Anything matching a markdown link with that
// shape is treated as a mention.

const MENTION_RE = /\[@([^\]\n]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g

export interface ExtractedMention {
  id: string
  label: string
}

export function extractMentions(bodyMd: string | null | undefined): ExtractedMention[] {
  if (!bodyMd) return []
  const seen = new Set<string>()
  const out: ExtractedMention[] = []
  for (const match of bodyMd.matchAll(MENTION_RE)) {
    const label = match[1]!
    const id = match[2]!
    if (!seen.has(id)) {
      seen.add(id)
      out.push({ id, label })
    }
  }
  return out
}
