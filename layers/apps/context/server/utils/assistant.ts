// Assistant prompt builder, tool definitions, and section-update parser.
//
// The system prompt mirrors the source FastAPI app's `assistant.py` — same
// `section-update` block format, same tool-use semantics (load_section up to
// 3 times per turn), same edit-notice wording. Differences:
//   - We drop `load_organization` since one org now has many portfolios; an
//     agent should focus on one at a time.
//   - "Org name" becomes "Portfolio name" — the user-facing scope is the
//     portfolio, the org is implicit (multi mode) or absent (single mode).

import type { Transaction } from 'kysely'
import type { Database } from '#core/server/database/schema'
import type { PortfolioRow } from './portfolio-helpers'
import { getPortfolioSections } from './section-settings'
import { loadSection } from './section-helpers'
import type { AnthropicToolDef } from './anthropic-client'

export interface ProposedUpdate {
  section_key: string
  section_title: string
  current_content: string
  proposed_content: string
}

export const LOAD_SECTION_TOOL: AnthropicToolDef = {
  name: 'load_section',
  description: 'Load the full content of a portfolio section. Use this before proposing updates to a section whose content you haven\'t seen yet. You can call this up to 3 times per conversation turn.',
  input_schema: {
    type: 'object',
    properties: {
      section_key: {
        type: 'string',
        description: 'The key of the section to load (e.g. \'vision-and-values\', \'team\').'
      }
    },
    required: ['section_key']
  }
}

const SYSTEM_PROMPT_TEMPLATE = `You are an AI assistant for Context Portfolio, helping users manage organizational knowledge.

You have access to a portfolio's sections, which contain structured context about a team or initiative.

## Your capabilities:
- Answer questions about the portfolio based on section content
- Help draft content (emails, messages, documents) using portfolio context
- Suggest updates to portfolio sections when the user provides new information
- Reword, restructure, or refine existing section content on request

## Loading additional context:
You currently have the content for the section(s) listed under "Portfolio context" below. The "Available sections" list shows ALL sections by key, title, and description.

**IMPORTANT:** Before proposing an update to any section whose content you have NOT yet seen, you MUST use the \`load_section\` tool to read its current content first. Never blindly overwrite a section.

## Section update format:
When you determine that one or more sections should be updated, include proposed changes in your response using this exact format (one block per section):

\`\`\`section-update
SECTION_KEY: <section_key>
SECTION_TITLE: <section_title>
---
<full proposed content for the section>
\`\`\`

Only propose updates when the user's message contains information that should be captured, or when they explicitly ask to modify content. Always explain what you're changing and why before the update blocks.

{edit_notice}

## Available sections:
{section_list}

## Portfolio context:
{context}
`

const EDIT_NOTICE_CAN_EDIT = 'The user has edit access. They can accept or reject each proposed update individually.'
const EDIT_NOTICE_VIEWER = 'The user has view-only access. You can help them draft content and answer questions, but they cannot save changes to sections. Do NOT propose section updates.'

export async function buildSystemPrompt(
  tx: Transaction<Database>,
  portfolio: PortfolioRow,
  userCanEdit: boolean
): Promise<{ prompt: string, contextLoaded: string[], sectionsByKey: Map<string, string>, knownKeys: Set<string> }> {
  const defs = await getPortfolioSections(tx, portfolio.id)
  const knownKeys = new Set(defs.map(d => d.key))

  const sectionRows = await tx
    .selectFrom('context_sections')
    .select(['section_key', 'content'])
    .where('portfolio_id', '=', portfolio.id)
    .execute()

  const sectionsByKey = new Map<string, string>()
  for (const r of sectionRows) {
    if (typeof r.content === 'string' && r.content.trim().length > 0) {
      sectionsByKey.set(r.section_key as string, r.content)
    }
  }

  const contextParts: string[] = []
  const contextLoaded: string[] = []
  for (const [key, content] of sectionsByKey) {
    const def = defs.find(d => d.key === key)
    const title = def?.title ?? key
    contextParts.push(`## ${title}\n\n${content}`)
    contextLoaded.push(title)
  }
  const contextText = `# Portfolio: ${portfolio.name}\n\n${contextParts.join('\n\n---\n\n')}`

  const sectionList = defs
    .map(s => `- \`${s.key}\`: ${s.title} — ${s.description}`)
    .join('\n')

  const editNotice = userCanEdit ? EDIT_NOTICE_CAN_EDIT : EDIT_NOTICE_VIEWER

  const prompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{edit_notice}', editNotice)
    .replace('{section_list}', sectionList)
    .replace('{context}', contextText)

  return { prompt, contextLoaded, sectionsByKey, knownKeys }
}

// Build the per-turn `load_section` tool handler. State (counts, loaded
// keys) lives in the closure so each chat request gets a fresh limiter.
export function makeLoadSectionHandler(
  tx: Transaction<Database>,
  portfolio: PortfolioRow,
  sectionsByKey: Map<string, string>,
  contextLoaded: string[],
  knownKeys: Set<string>
): { handle: (name: string, input: Record<string, unknown>) => Promise<string> } {
  let loadCount = 0
  return {
    async handle(name, input) {
      if (name !== 'load_section') {
        return `Error: unknown tool '${name}'.`
      }
      if (loadCount >= 3) {
        return 'Error: load_section limit reached (max 3 per turn).'
      }
      const key = typeof input.section_key === 'string' ? input.section_key : ''
      if (!knownKeys.has(key)) {
        return `Error: unknown section key '${key}'.`
      }
      if (sectionsByKey.has(key)) {
        return `Section '${key}' is already loaded in your context.`
      }
      loadCount++
      const row = await loadSection(tx, portfolio.id, key)
      const content = (row?.content ?? '').trim()
      if (!content) {
        return `Section '${key}' exists but has no content yet.`
      }
      sectionsByKey.set(key, content)
      contextLoaded.push(key)
      return `## ${key}\n\n${content}`
    }
  }
}

const SECTION_UPDATE_PATTERN = /```\s*section-update\s*\r?\n\s*SECTION_KEY:\s*(.+?)\s*\r?\n\s*SECTION_TITLE:\s*(.+?)\s*\r?\n\s*---\s*\r?\n([\s\S]*?)```/g

export function parseProposedUpdates(
  reply: string,
  knownKeys: Set<string>,
  currentByKey: Map<string, string>
): ProposedUpdate[] {
  const updates: ProposedUpdate[] = []
  const re = new RegExp(SECTION_UPDATE_PATTERN.source, SECTION_UPDATE_PATTERN.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(reply))) {
    const key = (m[1] ?? '').trim()
    const title = (m[2] ?? '').trim()
    const content = (m[3] ?? '').trim()
    if (knownKeys.has(key)) {
      updates.push({
        section_key: key,
        section_title: title,
        current_content: currentByKey.get(key) ?? '',
        proposed_content: content
      })
    }
  }
  return updates
}

export function stripUpdateBlocks(reply: string): string {
  return reply.replace(new RegExp(SECTION_UPDATE_PATTERN.source, SECTION_UPDATE_PATTERN.flags), '').trim()
}
