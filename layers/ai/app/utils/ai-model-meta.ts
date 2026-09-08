import type { AiModelInfo } from '#core/ai-fallback/types'

// One-line price + context summary for a model, shared by the pickers and the
// enabled-models list: "$3 in · $15 out /M · 200K ctx".

function price(n: number | null): string {
  if (n === null) return '—'
  if (n === 0) return '$0'
  return `$${n < 1 ? Number(n.toFixed(3)) : Number(n.toFixed(2))}`
}

function context(n: number | null): string {
  if (n === null) return ''
  return n >= 1000 ? `${Math.round(n / 1000)}K ctx` : `${n} ctx`
}

export function modelMeta(m: AiModelInfo): string {
  const parts = [`${price(m.promptPrice)} in · ${price(m.completionPrice)} out /M`]
  const ctx = context(m.contextLength)
  if (ctx) parts.push(ctx)
  return parts.join(' · ')
}
