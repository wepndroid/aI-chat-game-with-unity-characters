type PromptDebugDecision = {
  enabled: boolean
  reason: 'not_requested' | 'backend_disabled' | 'enabled'
}

type PromptDebugPolicyInput = {
  debugPromptRequested: boolean
  userId: string
  sessionId: string
}

const isPromptDebugGloballyEnabled = () => {
  const value = process.env.CHAT_PROMPT_DEBUG_ENABLED?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

/**
 * Operational prompt diagnostics policy.
 *
 * Ownership and access checks happen in the chat routes before this policy is
 * evaluated. This function deliberately does not inspect provider credentials
 * or log prompts; it only combines Unity's per-request debug flag with the
 * backend kill switch so production can disable the support diagnostic surface
 * without a Unity build.
 */
const resolvePromptDebugDecision = (input: PromptDebugPolicyInput): PromptDebugDecision => {
  void input.userId
  void input.sessionId

  if (!input.debugPromptRequested) {
    return { enabled: false, reason: 'not_requested' }
  }

  if (!isPromptDebugGloballyEnabled()) {
    return { enabled: false, reason: 'backend_disabled' }
  }

  return { enabled: true, reason: 'enabled' }
}

export { resolvePromptDebugDecision }
export type { PromptDebugDecision, PromptDebugPolicyInput }
