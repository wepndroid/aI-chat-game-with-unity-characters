import { type UnityRuntimeContext } from './prompt/visible-chat-prompt-types'

type VisibleAssistantRoleBoundaryDiagnosticInput = {
  assistantName: string
  playerName: string
  assistantText: string
  currentUserText: string
  runtimeContext: UnityRuntimeContext
  bTokensStreamed: boolean
}

type VisibleAssistantRoleBoundaryDiagnostics = {
  role_boundary_checked: boolean
  role_boundary_violation: boolean
  role_boundary_reason: string | null
  role_boundary_detected_after_stream_start: boolean
}

const nakedCharacterDirectivePattern = /\b(?:is|now|currently|remains)\s+(?:naked|undressed)\b|\bclothes?\s+(?:removed|off)\b/iu

const explicitPlayerNakedPattern =
  /\b(?:i\s+am|i'm|im|me|myself|player)\s+(?:am\s+|are\s+|feel\s+|look\s+)?(?:naked|undressed)\b|\bmy\s+clothes?\s+(?:are\s+)?(?:off|removed|gone)\b/iu

const playerBodyStateLeakPatterns = [
  /\bas\s+you\s+stand\s+there\s+naked\b/iu,
  /\byou(?:'re|\s+are)\s+naked\b/iu,
  /\byour\s+clothes?\s+(?:vanished|disappeared|are\s+gone|fall\s+away|slip\s+off)\b/iu,
  /\bthe\s+clothes?\s+you\s+were\s+wearing\b/iu,
  /\byour\s+exposed\s+body\b/iu,
  /\byou\s+instinctively\s+(?:try\s+to\s+)?cover\s+yourself\b/iu,
  /["“]\s*i\s+need\s+to\s+get\s+dressed/iu
]

const normalizeName = (value: string) => value.trim() || 'the character'

const contextSaysAssistantIsNaked = (runtimeContext: UnityRuntimeContext, assistantName: string) => {
  const normalizedAssistantName = normalizeName(assistantName).toLowerCase()

  return runtimeContext.directives.some((directive) => {
    const normalizedText = directive.text.toLowerCase()
    return (
      normalizedText.includes(normalizedAssistantName) &&
      nakedCharacterDirectivePattern.test(directive.text)
    )
  })
}

/**
 * Narrow, non-blocking classifier for the role-boundary failures found in
 * production smoke logs. It deliberately does not decide whether a reply is
 * valid enough to persist; Alessandro chose low-latency streaming plus
 * finish-and-persist. The classifier only produces safe diagnostics for prompt
 * tuning and user-provided log inspection.
 */
const diagnoseVisibleAssistantRoleBoundary = (
  input: VisibleAssistantRoleBoundaryDiagnosticInput
): VisibleAssistantRoleBoundaryDiagnostics => {
  const bAssistantNaked = contextSaysAssistantIsNaked(input.runtimeContext, input.assistantName)
  const bPlayerExplicitlyNaked = explicitPlayerNakedPattern.test(input.currentUserText)

  if (!bAssistantNaked || bPlayerExplicitlyNaked) {
    return {
      role_boundary_checked: true,
      role_boundary_violation: false,
      role_boundary_reason: null,
      role_boundary_detected_after_stream_start: false
    }
  }

  const matchedPattern = playerBodyStateLeakPatterns.find((pattern) => pattern.test(input.assistantText)) ?? null
  if (!matchedPattern) {
    return {
      role_boundary_checked: true,
      role_boundary_violation: false,
      role_boundary_reason: null,
      role_boundary_detected_after_stream_start: false
    }
  }

  return {
    role_boundary_checked: true,
    role_boundary_violation: true,
    role_boundary_reason: `assistant_naked_state_transferred_to_player:${matchedPattern.source}`,
    role_boundary_detected_after_stream_start: input.bTokensStreamed
  }
}

export { diagnoseVisibleAssistantRoleBoundary }
export type { VisibleAssistantRoleBoundaryDiagnostics }
