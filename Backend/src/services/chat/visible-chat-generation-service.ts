import {
  streamLlamaCompletion,
  type StreamLlamaCompletionResult
} from './llama-completion-stream-adapter'
import { ChatAiProviderError } from './chat-ai-error'
import { resolveVisibleChatGenerationSettings, type VisibleChatGenerationMode } from './chat-generation-settings'
import { createVisibleAssistantOutputFilter } from './visible-assistant-output-filter'
import {
  diagnoseVisibleAssistantRoleBoundary,
  type VisibleAssistantRoleBoundaryDiagnostics
} from './visible-assistant-role-boundary-diagnostics'
import {
  diagnoseVisibleAssistantRefusalStyle,
  type VisibleAssistantRefusalStyleDiagnostics
} from './visible-assistant-refusal-style-diagnostics'
import { buildVisibleChatPrompt, buildVisibleChatPromptDebugPayload } from './prompt/visible-chat-prompt-builder'
import { loadVisibleChatContext } from './prompt/visible-chat-context-repository'
import { type AiProviderPlayerTier } from '../ai-provider-player-tier'
import {
  type AnimationCapabilities,
  type VisibleChatPromptDiagnostics,
  type UnityRuntimeContext,
  type VisibleChatPromptDebugPayload
} from './prompt/visible-chat-prompt-types'

type GenerateVisibleAssistantReplyInput = {
  userMessage: string
  runtimeContext: UnityRuntimeContext
  animationCapabilities: AnimationCapabilities
  requestId: string
  sessionId: string
  storyId: string
  userId: string
  providerPlayerTier: AiProviderPlayerTier
  mode: VisibleChatGenerationMode
  gameplayEventType?: string | null
  gameplayEventPayload?: Record<string, unknown> | null
  forceFailure?: boolean
  abortSignal?: AbortSignal
  onPromptDebug?: (payload: VisibleChatPromptDebugPayload) => void | Promise<void>
  onToken?: (token: string) => void | Promise<void>
}

type VisibleChatGenerationDiagnostics = StreamLlamaCompletionResult['diagnostics'] &
  VisibleAssistantRoleBoundaryDiagnostics &
  VisibleAssistantRefusalStyleDiagnostics &
  VisibleChatPromptDiagnostics & {
    filter_prefix_buffer_limit_chars: number
    filter_prefix_chars_seen: number
    filter_stripped_prefix_chars: number
    filter_stripped_scaffold: boolean
    filter_internal_boundary_detected: boolean
    filter_internal_boundary_marker: string | null
    filter_truncated_at_internal_boundary: boolean
    filter_internal_boundary_safe_chars: number
    filter_holdback_limit_chars: number
    filter_output_chars: number
  }

type GenerateVisibleAssistantReplyResult = Omit<StreamLlamaCompletionResult, 'diagnostics'> & {
  diagnostics: VisibleChatGenerationDiagnostics
}

const mergePromptDiagnostics = (
  promptDebugPayload: VisibleChatPromptDebugPayload,
  details: Record<string, unknown>
) => ({
  prompt_sha256: promptDebugPayload.diagnostics.prompt_sha256,
  prompt_chars: promptDebugPayload.diagnostics.prompt_chars,
  prompt_utf8_bytes: promptDebugPayload.diagnostics.prompt_utf8_bytes,
  provider_template: promptDebugPayload.diagnostics.provider_template,
  included_history_rows: promptDebugPayload.diagnostics.included_history_rows,
  unity_runtime_directive_count: promptDebugPayload.diagnostics.unity_runtime_directive_count,
  animation_mood_count: promptDebugPayload.diagnostics.animation_mood_count,
  animation_gesture_count: promptDebugPayload.diagnostics.animation_gesture_count,
  animation_big_gesture_count: promptDebugPayload.diagnostics.animation_big_gesture_count,
  n_keep: promptDebugPayload.diagnostics.n_keep,
  stop: promptDebugPayload.diagnostics.stop,
  generation: promptDebugPayload.diagnostics.generation,
  ...details
})

/**
 * Visible text generation entry point used by normal chat and gameplay-send.
 *
 * Unity sends structured runtime facts and animation capabilities. The backend
 * owns prompt prose, story/history composition, provider template formatting,
 * and authenticated provider transport. This keeps provider credentials and
 * prompt-injection trust boundaries server-side while preserving 06A token
 * streaming and 06B pending-turn persistence semantics.
 */
const generateVisibleAssistantReply = async (
  input: GenerateVisibleAssistantReplyInput
): Promise<GenerateVisibleAssistantReplyResult> => {
  if (input.forceFailure) {
    await Promise.resolve()
    throw new ChatAiProviderError('ai_provider_forced_failure', 'Forced AI failure.')
  }

  const context = await loadVisibleChatContext({
    sessionId: input.sessionId,
    storyId: input.storyId,
    userId: input.userId
  })

  const promptBuild = await buildVisibleChatPrompt(
    context,
    {
      mode: input.mode,
      currentUserText: input.userMessage,
      gameplayEventType: input.gameplayEventType ?? null,
      gameplayEventPayload: input.gameplayEventPayload ?? null,
      runtimeContext: input.runtimeContext,
      animationCapabilities: input.animationCapabilities
    },
    input.abortSignal
  )

  const generationSettings = resolveVisibleChatGenerationSettings(input.mode, {
    stop: promptBuild.stop,
    nKeep: promptBuild.nKeep,
    requestId: input.requestId
  })

  const promptDebugPayload = buildVisibleChatPromptDebugPayload(promptBuild, generationSettings)
  promptDebugPayload.diagnostics.provider_player_tier = input.providerPlayerTier

  if (input.onPromptDebug) {
    await input.onPromptDebug(promptDebugPayload)
  }

  let bTokensStreamed = false
  const visibleOutputFilter = createVisibleAssistantOutputFilter({
    assistantName: context.story.characterName,
    onToken: async (token) => {
      bTokensStreamed = true
      await input.onToken?.(token)
    }
  })

  try {
    const providerResult = await streamLlamaCompletion({
      requestId: input.requestId,
      prompt: promptBuild.prompt,
      userId: input.userId,
      playerTier: input.providerPlayerTier,
      settings: generationSettings,
      abortSignal: input.abortSignal,
      onToken: visibleOutputFilter.onProviderToken
    })

    const content = await visibleOutputFilter.complete()
    const filterDiagnostics = visibleOutputFilter.getDiagnostics()
    const roleBoundaryDiagnostics = diagnoseVisibleAssistantRoleBoundary({
      assistantName: context.story.characterName,
      playerName: context.story.playerName,
      assistantText: content,
      currentUserText: input.userMessage,
      runtimeContext: input.runtimeContext,
      bTokensStreamed
    })
    const refusalStyleDiagnostics = diagnoseVisibleAssistantRefusalStyle({
      assistantText: content
    })
    const diagnostics: VisibleChatGenerationDiagnostics = {
      ...promptDebugPayload.diagnostics,
      ...providerResult.diagnostics,
      ...filterDiagnostics,
      filter_output_chars: content.length,
      ...roleBoundaryDiagnostics,
      ...refusalStyleDiagnostics
    }

    if (diagnostics.role_boundary_violation) {
      console.warn(
        `Visible chat role-boundary diagnostic: request=${input.requestId} reason=${diagnostics.role_boundary_reason}`
      )
    }

    if (diagnostics.meta_refusal_language_detected) {
      console.warn(
        `Visible chat refusal-style diagnostic: request=${input.requestId} reason=${diagnostics.meta_refusal_reason}`
      )
    }

    return {
      ...providerResult,
      content,
      diagnostics
    }
  } catch (error) {
    if (error instanceof ChatAiProviderError) {
      throw new ChatAiProviderError(error.reason, error.message, {
        statusCode: error.statusCode ?? undefined,
        cause: error,
        details: mergePromptDiagnostics(promptDebugPayload, {
          ...error.details,
          ...visibleOutputFilter.getDiagnostics()
        })
      })
    }

    throw error
  }
}

export { generateVisibleAssistantReply }
export type { GenerateVisibleAssistantReplyInput, GenerateVisibleAssistantReplyResult, VisibleChatGenerationDiagnostics }
