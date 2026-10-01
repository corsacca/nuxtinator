// Portfolio template registry. A template is the code-owned set of sections a
// portfolio is created with. The built-in `default` template is the catalog in
// `section-catalog.ts`; other layers call `registerPortfolioTemplate({...})`
// from a Nitro plugin to add their own. A portfolio stores only its template
// id and its sections' keys — titles, descriptions, order, and staleness of a
// template's sections always resolve from here.

import { CONTEXT_SECTIONS, slugifySectionTitle, type SectionDef } from './section-catalog'

export interface PortfolioTemplate {
  id: string
  label: string
  description?: string
  sections: readonly SectionDef[]
}

export const DEFAULT_PORTFOLIO_TEMPLATE_ID = 'default'

const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

const _templates = new Map<string, PortfolioTemplate>([
  [DEFAULT_PORTFOLIO_TEMPLATE_ID, {
    id: DEFAULT_PORTFOLIO_TEMPLATE_ID,
    label: 'Organization',
    description: 'Identity, vision, team, goals, and the other sections that describe an organization.',
    sections: CONTEXT_SECTIONS
  }]
])

// Throws on an invalid or duplicate registration so a broken template fails
// the boot instead of resolving wrong titles later.
export function registerPortfolioTemplate(template: PortfolioTemplate): void {
  if (!template || typeof template.id !== 'string' || !TEMPLATE_ID_RE.test(template.id)) {
    throw new Error(`[context] portfolio template id must match ${TEMPLATE_ID_RE} (got ${JSON.stringify(template?.id)})`)
  }
  if (_templates.has(template.id)) {
    throw new Error(`[context] portfolio template "${template.id}" is already registered`)
  }
  if (typeof template.label !== 'string' || template.label.length === 0) {
    throw new Error(`[context] portfolio template "${template.id}" needs a label`)
  }

  const seen = new Set<string>()
  for (const s of template.sections ?? []) {
    if (typeof s?.key !== 'string' || s.key.length === 0 || slugifySectionTitle(s.key) !== s.key) {
      throw new Error(`[context] portfolio template "${template.id}" has an invalid section key ${JSON.stringify(s?.key)} (lowercase letters, digits, and hyphens, at most 64)`)
    }
    if (seen.has(s.key)) {
      throw new Error(`[context] portfolio template "${template.id}" declares section "${s.key}" more than once`)
    }
    seen.add(s.key)
  }

  _templates.set(template.id, {
    ...template,
    sections: Object.freeze(template.sections.map(s => Object.freeze({ ...s })))
  })
}

export function getRegisteredPortfolioTemplates(): PortfolioTemplate[] {
  return [..._templates.values()]
}

// `null`/`undefined` is the default template.
export function getRegisteredPortfolioTemplate(id: string | null | undefined): PortfolioTemplate | null {
  return _templates.get(id ?? DEFAULT_PORTFOLIO_TEMPLATE_ID) ?? null
}
