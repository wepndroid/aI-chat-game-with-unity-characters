type VisibleAssistantHistorySanitization = {
  text: string
  bRemovedMetaRefusalPreamble: boolean
  bDroppedHistoryRow: boolean
  bRecoveredContinuation: boolean
}

const LEADING_META_REFUSAL_PATTERNS = [
  /^\s*I need to decline\b/iu,
  /^\s*I can engage with adult fiction\b/iu,
  /^\s*I don't write content focused on\b/iu,
  /^\s*This violates policy or guidelines\b/iu,
  /^\s*As an AI\b/iu,
  /^\s*I (?:cannot|can't) (?:write|continue|provide|help with)\b/iu
] as const

const IN_CHARACTER_CONTINUATION_START = /(?:^|[\n.?!]\s+)((?:\[(?:mood|gesture|big_gesture):[^\]]+\]\s*)?(?:\*|["“]))/iu

const startsWithKnownMetaRefusal = (value: string) =>
  LEADING_META_REFUSAL_PATTERNS.some((pattern) => pattern.test(value))

const findInCharacterContinuation = (value: string) => {
  const match = IN_CHARACTER_CONTINUATION_START.exec(value)
  if (!match?.[1]) {
    return ''
  }

  const markerOffset = match[0].lastIndexOf(match[1])
  const startIndex = match.index + markerOffset
  return value.slice(startIndex).trim()
}

/**
 * Removes only known leading meta-refusal leakage from assistant history before
 * that history is reused as prompt context. Persisted transcript rows are not
 * rewritten; this only prevents a prior bad visible answer from becoming a
 * future in-context example.
 */
const sanitizeVisibleAssistantHistoryForPrompt = (value: string): VisibleAssistantHistorySanitization => {
  const text = value.trim()
  if (!startsWithKnownMetaRefusal(text)) {
    return {
      text,
      bRemovedMetaRefusalPreamble: false,
      bDroppedHistoryRow: false,
      bRecoveredContinuation: false
    }
  }

  const continuation = findInCharacterContinuation(text)
  if (continuation) {
    return {
      text: continuation,
      bRemovedMetaRefusalPreamble: true,
      bDroppedHistoryRow: false,
      bRecoveredContinuation: true
    }
  }

  return {
    text: '',
    bRemovedMetaRefusalPreamble: true,
    bDroppedHistoryRow: true,
    bRecoveredContinuation: false
  }
}

export { sanitizeVisibleAssistantHistoryForPrompt }
export type { VisibleAssistantHistorySanitization }
