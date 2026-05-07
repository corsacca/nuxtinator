// Compares two semver-ish strings ("1.20.0", "1.20.0-alpha.1", etc.).
// Per semver: a pre-release version (1.20.0-alpha) is *less than* its base
// (1.20.0). This matters because the SDK's MCP-Protocol-Version enforcement
// landed in stable 1.20.0; a 1.20.0-alpha that lacks the behavior must still
// fail the floor check. We strip the pre-release suffix to compare numeric
// parts, then break ties by treating "has suffix" as lower than "no suffix".
//
// Returns -1 if a < b, 1 if a > b, 0 if equal.
export function compareVersions(a: string, b: string): number {
  const splitOnDash = (v: string): { core: string, pre: string | null } => {
    const idx = v.indexOf('-')
    return idx === -1
      ? { core: v, pre: null }
      : { core: v.slice(0, idx), pre: v.slice(idx + 1) }
  }
  const sa = splitOnDash(a)
  const sb = splitOnDash(b)
  const pa = sa.core.split('.').map(s => parseInt(s, 10) || 0)
  const pb = sb.core.split('.').map(s => parseInt(s, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0
    const bv = pb[i] ?? 0
    if (av !== bv) return av < bv ? -1 : 1
  }
  // Numeric parts equal — pre-release sorts below release.
  if (sa.pre && !sb.pre) return -1
  if (!sa.pre && sb.pre) return 1
  return 0
}
