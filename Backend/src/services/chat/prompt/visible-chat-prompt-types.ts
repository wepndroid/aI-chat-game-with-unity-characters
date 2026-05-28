import { ChatMessageRole } from '@prisma/client'

type UnityRuntimeDirectiveScope = 'current_turn' | 'session_state'
type UnityRuntimeDirectiveKind = 'fact' | 'constraint' | 'style_hint'

type UnityRuntimeDirective = {
  id: string
  scope: UnityRuntimeDirectiveScope
  kind: UnityRuntimeDirectiveKind
  text: string
}

type UnityRuntimeContext = {
  contract_version: 2
  directives: UnityRuntimeDirective[]
}

type AnimationCapabilityEntry = {
  id: string
  description?: string
}

type AnimationCapabilities = {
  contract_version: 1
  moods: AnimationCapabilityEntry[]
  gestures: AnimationCapabilityEntry[]
  big_gestures: AnimationCapabilityEntry[]
  example_response?: string
}

type VisibleChatHistoryRow = {
  role: ChatMessageRole
  content: string
}

type VisibleChatStoryContext = {
  characterName: string
  playerName: string
  title: string | null
  promptDescription: string | null
  personality: string | null
  scenarioStory: string | null
  scenarioChat: string | null
  firstMessage: string | null
}

type VisibleChatContext = {
  story: VisibleChatStoryContext
  historyRows: VisibleChatHistoryRow[]
}

type VisibleChatTurnInput = {
  mode: 'normal' | 'gameplay'
  currentUserText: string
  gameplayEventType?: string | null
  gameplayEventPayload?: Record<string, unknown> | null
  runtimeContext: UnityRuntimeContext
  animationCapabilities: AnimationCapabilities
}

import { type AiProviderPlayerTier } from '../../ai-provider-player-tier'

type PromptChatRole = 'system' | 'user' | 'assistant'

type PromptChatMessage = {
  role: PromptChatRole
  content: string
}

type PromptParticipantNames = {
  playerName: string
  assistantName: string
}

type VisibleChatPromptDiagnostics = {
  prompt_sha256: string
  prompt_chars: number
  prompt_utf8_bytes: number
  provider_template: string
  included_history_rows: number
  unity_runtime_directive_count: number
  animation_mood_count: number
  animation_gesture_count: number
  animation_big_gesture_count: number
  n_keep: number
  stop: string[]
  generation?: Record<string, unknown>
  provider_player_tier?: AiProviderPlayerTier
}

type VisibleChatPromptDebugPayload = {
  prompt: string
  diagnostics: VisibleChatPromptDiagnostics
}

export type {
  AnimationCapabilities,
  AnimationCapabilityEntry,
  PromptChatMessage,
  PromptChatRole,
  PromptParticipantNames,
  UnityRuntimeContext,
  UnityRuntimeDirective,
  UnityRuntimeDirectiveKind,
  UnityRuntimeDirectiveScope,
  VisibleChatContext,
  VisibleChatHistoryRow,
  VisibleChatPromptDebugPayload,
  VisibleChatPromptDiagnostics,
  VisibleChatStoryContext,
  VisibleChatTurnInput
}
