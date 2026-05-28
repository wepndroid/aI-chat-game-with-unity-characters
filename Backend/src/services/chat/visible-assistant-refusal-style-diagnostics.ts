type VisibleAssistantRefusalStyleDiagnosticInput = {
  assistantText: string
}

type VisibleAssistantRefusalStyleDiagnostics = {
  refusal_style_checked: boolean
  meta_refusal_language_detected: boolean
  meta_refusal_reason: string | null
}

const metaRefusalLanguagePatterns: Array<{ reason: string, pattern: RegExp }> = [
  {
    reason: 'I need to decline this direction',
    pattern: /\bi\s+need\s+to\s+decline\s+this\s+direction\b/iu
  },
  {
    reason: 'As an AI',
    pattern: /\bas\s+an\s+ai\b/iu
  },
  {
    reason: 'I cannot write',
    pattern: /\bi\s+cannot\s+write\b/iu
  },
  {
    reason: "I don't write content",
    pattern: /\bi\s+don['’]t\s+write\s+content\b/iu
  },
  {
    reason: 'policy',
    pattern: /\b(?:violates?|against|follow(?:ing)?|because\s+of|due\s+to)\s+(?:the\s+)?(?:policy|policies)\b|\b(?:content|provider|safety)\s+polic(?:y|ies)\b/iu
  },
  {
    reason: 'guidelines',
    pattern: /\b(?:violates?|against|follow(?:ing)?|because\s+of|due\s+to)\s+(?:the\s+)?guidelines?\b|\b(?:content|provider|safety)\s+guidelines?\b|\b(?:policy|policies)\s+(?:or|and)\s+guidelines?\b/iu
  },
  {
    reason: 'safety rules',
    pattern: /\bsafety\s+rules?\b/iu
  },
  {
    reason: 'adult fiction',
    pattern: /\badult\s+fiction\b/iu
  },
  {
    reason: 'roleplay context',
    pattern: /\broleplay\s+context\b/iu
  }
]

/**
 * Reports visible-chat meta-refusal leakage without changing the assistant
 * output. This is a logging and prompt-tuning signal only; it must not rewrite,
 * retry, block, or classify persisted turns.
 */
const diagnoseVisibleAssistantRefusalStyle = (
  input: VisibleAssistantRefusalStyleDiagnosticInput
): VisibleAssistantRefusalStyleDiagnostics => {
  const matchedPattern = metaRefusalLanguagePatterns.find((candidate) => candidate.pattern.test(input.assistantText))

  return {
    refusal_style_checked: true,
    meta_refusal_language_detected: Boolean(matchedPattern),
    meta_refusal_reason: matchedPattern ? `meta_refusal_language:${matchedPattern.reason}` : null
  }
}

export { diagnoseVisibleAssistantRefusalStyle }
export type { VisibleAssistantRefusalStyleDiagnostics }
