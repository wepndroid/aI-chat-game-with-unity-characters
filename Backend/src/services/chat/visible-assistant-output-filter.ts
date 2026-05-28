import { ChatAiProviderError } from './chat-ai-error'
import {
  VISIBLE_CHAT_INTERNAL_BOUNDARY_HOLDBACK_CHARS,
  findFirstVisibleChatInternalBoundary
} from './visible-chat-internal-boundaries'

type VisibleAssistantOutputFilterInput = {
  assistantName: string
  onToken?: (token: string) => void | Promise<void>
}

type VisibleAssistantOutputFilter = {
  onProviderToken: (token: string) => Promise<'continue' | 'stop_success'>
  complete: () => Promise<string>
  getDiagnostics: () => VisibleAssistantOutputFilterDiagnostics
}

const PREFIX_BUFFER_LIMIT_CHARS = 512

type VisibleAssistantOutputFilterDiagnostics = {
  filter_prefix_buffer_limit_chars: number
  filter_prefix_chars_seen: number
  filter_stripped_prefix_chars: number
  filter_stripped_scaffold: boolean
  filter_internal_boundary_detected: boolean
  filter_internal_boundary_marker: string | null
  filter_truncated_at_internal_boundary: boolean
  filter_internal_boundary_safe_chars: number
  filter_holdback_limit_chars: number
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeAssistantName = (assistantName: string) => assistantName.trim() || 'Assistant'

const leadingSeparatorPattern = /^(?:\s*(?:[-*_]{3,}|#{1,6}\s*|>\s*)\s*)+/u

const buildPreamblePatterns = (assistantName: string) => {
  const escapedAssistantName = escapeRegExp(normalizeAssistantName(assistantName))
  return [
    new RegExp(`^\\s*${escapedAssistantName}\\s*[:：-]\\s*`, 'iu'),
    /^\s*assistant\s*[:：-]\s*/iu,
    /^\s*(?:i['’]?ll|i\s+will)\s+continue(?:\s+(?:the|this))?\s+(?:story|scene|roleplay)(?:\s+as\s+[^:\n]{1,100})?(?:\s+while\s+following\s+(?:all\s+)?guidelines)?\s*[:：]\s*/iu,
    /^\s*(?:sure|okay|of\s+course)[,.!\s]+(?:here(?:'s|\s+is)\s+)?(?:the\s+)?(?:next\s+)?(?:response|reply|continuation|story|scene|roleplay)(?:\s+for\s+[^:\n]{1,100})?\s*[:：]\s*/iu,
    /^\s*as\s+an\s+ai(?:\s+language\s+model)?[^:\n]{0,220}\s*[:：]\s*/iu
  ]
}

/**
 * Removes only leading provider scaffolding from visible assistant text.
 *
 * This is intentionally narrow. Safety refusals and in-character prose are not
 * rewritten. The same helper is used for prompt-history cleanup and live stream
 * filtering so polluted old rows do not continue to teach the provider a bad
 * response shape, while displayed and persisted content stay identical for new
 * turns.
 */
const stripLeadingVisibleAssistantPreamble = (value: string, assistantName: string) => {
  let result = value
  const patterns = buildPreamblePatterns(assistantName)

  for (;;) {
    const before = result
    result = result.replace(leadingSeparatorPattern, '')

    for (const pattern of patterns) {
      result = result.replace(pattern, '')
    }

    if (result === before) {
      return result
    }
  }
}

const isPotentialPreamblePrefix = (value: string, assistantName: string) => {
  const candidate = value.replace(leadingSeparatorPattern, '').trimStart().toLowerCase()
  if (!candidate) {
    return true
  }

  const assistantLabel = `${normalizeAssistantName(assistantName).toLowerCase()}:`
  const starters = [
    assistantLabel,
    'assistant:',
    "i'll continue",
    'ill continue',
    'i’ll continue',
    'i will continue',
    'sure',
    'okay',
    'of course',
    'as an ai'
  ]

  return starters.some((starter) => starter.startsWith(candidate) || candidate.startsWith(starter))
}

const getSafeEmitLength = (value: string, requestedLength: number) => {
  if (requestedLength <= 0) {
    return 0
  }
  if (requestedLength >= value.length) {
    return value.length
  }

  const lastCodeUnit = value.charCodeAt(requestedLength - 1)
  const bWouldSplitSurrogatePair = lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff
  return bWouldSplitSurrogatePair ? requestedLength - 1 : requestedLength
}

/**
 * Streaming-safe output boundary for visible SecretWaifu assistant replies.
 *
 * The provider can emit a short meta preamble before the actual roleplay. A
 * final-only sanitizer would make Unity display different text than the pending
 * turn later commits. This filter buffers only a bounded prefix window, strips
 * known leading scaffolding before forwarding any visible token, then keeps a
 * tiny rolling holdback so backend/provider prompt markers cannot leak even
 * when a marker is split across upstream SSE chunks.
 */
const createVisibleAssistantOutputFilter = (input: VisibleAssistantOutputFilterInput): VisibleAssistantOutputFilter => {
  let prefixBuffer = ''
  let boundaryHoldback = ''
  let bPrefixResolved = false
  let bInternalBoundaryDetected = false
  let content = ''
  const diagnostics: VisibleAssistantOutputFilterDiagnostics = {
    filter_prefix_buffer_limit_chars: PREFIX_BUFFER_LIMIT_CHARS,
    filter_prefix_chars_seen: 0,
    filter_stripped_prefix_chars: 0,
    filter_stripped_scaffold: false,
    filter_internal_boundary_detected: false,
    filter_internal_boundary_marker: null,
    filter_truncated_at_internal_boundary: false,
    filter_internal_boundary_safe_chars: 0,
    filter_holdback_limit_chars: VISIBLE_CHAT_INTERNAL_BOUNDARY_HOLDBACK_CHARS
  }

  const emit = async (token: string) => {
    if (!token) {
      return
    }

    content += token
    await input.onToken?.(token)
  }

  const emitWithInternalBoundaryGuard = async (token: string): Promise<'continue' | 'stop_success'> => {
    if (!token) {
      return bInternalBoundaryDetected ? 'stop_success' : 'continue'
    }
    if (bInternalBoundaryDetected) {
      return 'stop_success'
    }

    boundaryHoldback += token
    const boundary = findFirstVisibleChatInternalBoundary(boundaryHoldback)
    if (boundary) {
      const safeText = boundaryHoldback.slice(0, boundary.index)
      boundaryHoldback = ''
      if (safeText) {
        await emit(safeText)
      }

      bInternalBoundaryDetected = true
      diagnostics.filter_internal_boundary_detected = true
      diagnostics.filter_internal_boundary_marker = boundary.marker
      diagnostics.filter_truncated_at_internal_boundary = true
      diagnostics.filter_internal_boundary_safe_chars = content.length
      return 'stop_success'
    }

    const emitLength = getSafeEmitLength(
      boundaryHoldback,
      boundaryHoldback.length - VISIBLE_CHAT_INTERNAL_BOUNDARY_HOLDBACK_CHARS
    )
    if (emitLength > 0) {
      const safeText = boundaryHoldback.slice(0, emitLength)
      boundaryHoldback = boundaryHoldback.slice(emitLength)
      await emit(safeText)
    }

    return 'continue'
  }

  const flushBoundaryHoldback = async () => {
    if (bInternalBoundaryDetected || !boundaryHoldback) {
      return
    }

    const safeText = boundaryHoldback
    boundaryHoldback = ''
    await emit(safeText)
  }

  const resolvePrefix = async (force: boolean): Promise<'continue' | 'stop_success'> => {
    if (bPrefixResolved) {
      return 'continue'
    }

    const stripped = stripLeadingVisibleAssistantPreamble(prefixBuffer, input.assistantName)
    const bStrippedSomething = stripped !== prefixBuffer
    diagnostics.filter_prefix_chars_seen = Math.max(diagnostics.filter_prefix_chars_seen, prefixBuffer.length)
    if (bStrippedSomething) {
      diagnostics.filter_stripped_scaffold = true
      diagnostics.filter_stripped_prefix_chars = Math.max(
        diagnostics.filter_stripped_prefix_chars,
        prefixBuffer.length - stripped.length
      )
    }
    const bShouldKeepBuffering =
      !force &&
      prefixBuffer.length < PREFIX_BUFFER_LIMIT_CHARS &&
      ((bStrippedSomething && stripped.trim().length === 0) ||
        (!bStrippedSomething && isPotentialPreamblePrefix(prefixBuffer, input.assistantName)))

    if (bShouldKeepBuffering) {
      return 'continue'
    }

    bPrefixResolved = true
    prefixBuffer = ''
    return emitWithInternalBoundaryGuard(stripped)
  }

  return {
    onProviderToken: async (token: string) => {
      if (bPrefixResolved) {
        return emitWithInternalBoundaryGuard(token)
      }

      prefixBuffer += token
      return resolvePrefix(false)
    },
    complete: async () => {
      await resolvePrefix(true)
      await flushBoundaryHoldback()
      const normalized = content.trim()
      if (!normalized && bInternalBoundaryDetected) {
        throw new ChatAiProviderError(
          'ai_provider_internal_prompt_boundary_only',
          'AI provider returned only internal prompt boundary text.',
          { details: diagnostics }
        )
      }
      if (!normalized) {
        throw new ChatAiProviderError(
          'ai_provider_scaffold_only_reply',
          'AI provider returned only stripped visible-chat scaffolding.',
          { details: diagnostics }
        )
      }
      return normalized
    },
    getDiagnostics: () => ({ ...diagnostics })
  }
}

export { createVisibleAssistantOutputFilter, stripLeadingVisibleAssistantPreamble }
export type { VisibleAssistantOutputFilter, VisibleAssistantOutputFilterDiagnostics }
