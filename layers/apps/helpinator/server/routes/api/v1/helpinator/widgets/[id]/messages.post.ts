// POST /api/v1/helpinator/widgets/:id/messages — public. One visitor turn.
//
// The server holds the transcript: the widget sends only the new message plus
// its bearer session token (none on the first turn — the conversation is then
// created and its token returned). A token that is unknown, belongs to another
// widget, or whose conversation has ended starts a fresh conversation
// (`reset: true`), so the widget drops its cached copy.
//
// With `Accept: text/event-stream` the turn streams as server-sent events:
// `session` ({ token, conversationId, reset }) first, `status` ({ text }) as
// sections load, `delta` ({ text }) as reply text arrives, `discard` when text
// written before a tool call is dropped, `ping` keep-alives, then `done` with
// the JSON payload once committed, or `error` ({ statusCode, message }).
import { z } from 'zod'
import { createEventStream, getHeader, getRequestHeader, type H3Event } from 'h3'
import { complete } from '#ai/server'
import { helpinatorInbox } from '#helpinator/inbox'
import { helpinatorWithWidget } from '../../../../../../utils/helpinator-public'
import {
  HELPINATOR_MAX_MESSAGE_CHARS,
  HELPINATOR_MAX_VISITOR_MESSAGES,
  helpinatorBearer,
  helpinatorClientKey,
  helpinatorHashSessionToken,
  helpinatorMessagesToday,
  helpinatorNewSessionToken,
  helpinatorPageUrl,
  helpinatorRateLimit
} from '../../../../../../utils/helpinator-guards'
import {
  helpinatorCreateConversation,
  helpinatorFindSession,
  helpinatorInsertMessage,
  helpinatorIsLive,
  helpinatorListMessages,
  helpinatorPublicMessage
} from '../../../../../../utils/helpinator-conversations'
import {
  HELPINATOR_CHAT_FEATURE,
  helpinatorAiReady,
  helpinatorBuildBot,
  helpinatorHistoryToMessages
} from '../../../../../../utils/helpinator-bot'
import { helpinatorGetLibraries } from '../../../../../../utils/helpinator-libraries'

const Body = z.object({
  message: z.string().trim().min(1).max(HELPINATOR_MAX_MESSAGE_CHARS),
  pageUrl: z.string().max(2000).optional()
})

const KEEP_ALIVE_MS = 15_000

interface Sse {
  push: (name: string, data: unknown) => Promise<void>
  close: () => Promise<void>
}

// Opens the stream and sends headers at once. The send promise is not awaited,
// so a dropped client cannot abort the turn; pushes after a drop are no-ops.
function openSse(event: H3Event): Sse {
  const stream = createEventStream(event)
  const keepAlive = setInterval(() => {
    stream.push({ event: 'ping', data: '{}' }).catch(() => {})
  }, KEEP_ALIVE_MS)
  stream.send().catch(() => {})
  return {
    push: (name, data) => stream.push({ event: name, data: JSON.stringify(data) }).catch(() => {}),
    close: async () => {
      clearInterval(keepAlive)
      await stream.close()
    }
  }
}

export default defineEventHandler(async (event) => {
  const wantsStream = (getRequestHeader(event, 'accept') ?? '').includes('text/event-stream')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: `Please keep messages under ${HELPINATOR_MAX_MESSAGE_CHARS} characters.` })
  }
  const client = helpinatorClientKey(event)
  await helpinatorRateLimit(event, 'ratelimit.helpinator.message', 'client', client, 8, 60_000)
  await helpinatorRateLimit(event, 'ratelimit.helpinator.message.hour', 'client', client, 60, 60 * 60_000)

  const presentedToken = helpinatorBearer(event)
  const live: { sse: Sse | null } = { sse: null }

  try {
    const payload = await helpinatorWithWidget(event, async (tx, widget, origin) => {
      if (!widget.enabled || widget.library_ids.length === 0 || !(await helpinatorAiReady(tx))) {
        throw createError({ statusCode: 503, statusMessage: 'The help assistant is unavailable right now.' })
      }
      if ((await helpinatorMessagesToday(tx, widget.id)) >= widget.daily_message_cap) {
        throw createError({ statusCode: 429, statusMessage: 'The help assistant is very busy right now — please try again later.' })
      }

      // Resolve (or start) the conversation.
      let conversation = presentedToken
        ? await helpinatorFindSession(tx, widget.id, helpinatorHashSessionToken(presentedToken))
        : null
      let token = presentedToken
      const reset = Boolean(presentedToken) && (!conversation || !helpinatorIsLive(conversation, widget))
      if (!conversation || !helpinatorIsLive(conversation, widget)) {
        token = helpinatorNewSessionToken()
        conversation = await helpinatorCreateConversation(tx, {
          widget,
          sessionHash: helpinatorHashSessionToken(token),
          pageUrl: helpinatorPageUrl(parsed.data.pageUrl),
          origin,
          userAgent: getHeader(event, 'user-agent') ?? null
        })
      }
      if (conversation.visitor_message_count >= HELPINATOR_MAX_VISITOR_MESSAGES) {
        throw createError({ statusCode: 429, statusMessage: 'This conversation has reached its limit — please start a new one.' })
      }
      const session = { token: token!, conversationId: conversation.id, reset }

      const history = helpinatorHistoryToMessages(await helpinatorListMessages(tx, conversation.id))
      // The conversation's snapshot of the binding; RLS hides any library
      // that is not this org's, and an empty result means unavailable.
      const libraries = await helpinatorGetLibraries(tx, conversation.library_ids)
      if (libraries.length === 0) {
        throw createError({ statusCode: 503, statusMessage: 'The help assistant is unavailable right now.' })
      }
      const bot = await helpinatorBuildBot(tx, {
        libraries,
        defaultLibraryId: conversation.default_library_id,
        defaultSectionKey: widget.default_section_key,
        extraInstructions: widget.extra_instructions,
        handoffAvailable: helpinatorInbox.available,
        userMessage: parsed.data.message
      })
      const userMessage = await helpinatorInsertMessage(tx, {
        conversationId: conversation.id,
        role: 'user',
        content: parsed.data.message
      })

      let sse: Sse | null = null
      if (wantsStream) {
        sse = openSse(event)
        live.sse = sse
        await sse.push('session', session)
      }

      const result = await complete({
        tx,
        feature: HELPINATOR_CHAT_FEATURE,
        system: bot.system,
        messages: [...history, { role: 'user', content: parsed.data.message }],
        tools: bot.tools,
        onToolCall: (name, input) => {
          const what = bot.describeToolCall(name, input)
          if (sse && what) sse.push('status', { text: `Reading ${what}…` })
          return bot.onToolCall(name, input)
        },
        maxTokens: 1500,
        maxToolRounds: 3,
        onTextDelta: sse ? (text) => { sse!.push('delta', { text }) } : undefined,
        onTextDiscard: sse ? () => { sse!.push('discard', {}) } : undefined
      })

      const reply = result.text.trim() || 'Sorry — I could not come up with an answer to that.'
      const assistantMessage = await helpinatorInsertMessage(tx, {
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
        pagesLoaded: bot.pagesLoaded,
        searches: bot.searches,
        searchHits: bot.searchHits,
        model: result.model
      })

      return {
        ...session,
        userMessage: helpinatorPublicMessage(userMessage),
        assistantMessage: helpinatorPublicMessage(assistantMessage)
      }
    })
    if (!live.sse) return payload
    await live.sse.push('done', payload)
  } catch (err) {
    if (!live.sse) throw err
    const failure = err as { statusCode?: number, statusMessage?: string }
    if (!failure.statusCode || failure.statusCode >= 500) {
      console.error('[helpinator] turn failed mid-stream:', err)
    }
    await live.sse.push('error', {
      statusCode: failure.statusCode ?? 500,
      message: failure.statusCode && failure.statusCode < 500
        ? failure.statusMessage
        : 'Something went wrong — please try again.'
    })
  } finally {
    await live.sse?.close()
  }
})
