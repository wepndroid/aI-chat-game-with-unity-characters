import { createHash } from 'node:crypto'
import { ChatMessageRole } from '@prisma/client'

import { ChatAiProviderError } from '../chat-ai-error'
import { type ChatGenerationSettings } from '../chat-generation-settings'
import { resolveProviderTemplate, tokenizeProviderPrompt } from '../provider-template-service'
import { renderAnimationCapabilities } from './animation-capabilities-renderer'
import { renderVisibleChatContentPolicy } from './visible-chat-content-policy'
import { renderVisibleChatFinalReplyContract } from './visible-chat-final-reply-contract'
import { sanitizeVisibleAssistantHistoryForPrompt } from './visible-chat-history-sanitizer'
import { renderVisibleChatOutputContract } from './visible-chat-output-contract'
import { renderVisibleChatRefusalStyleContract } from './visible-chat-refusal-style-contract'
import { renderUnityRuntimeContext } from './unity-runtime-context-renderer'
import {
  type PromptChatMessage,
  type PromptParticipantNames,
  type VisibleChatContext,
  type VisibleChatPromptDebugPayload,
  type VisibleChatPromptDiagnostics,
  type VisibleChatTurnInput
} from './visible-chat-prompt-types'
import { stripLeadingVisibleAssistantPreamble } from '../visible-assistant-output-filter'
import {
  mergeVisibleChatStopSequences,
  truncateAtFirstVisibleChatInternalBoundary
} from '../visible-chat-internal-boundaries'

type VisibleChatPromptBuildResult = {
  prompt: string
  stop: string[]
  nKeep: number
  diagnostics: {
    promptSha256: string
    promptUtf8Bytes: number
    providerTemplate: string
    includedHistoryRows: number
    promptChars: number
    unityRuntimeDirectiveCount: number
    animationMoodCount: number
    animationGestureCount: number
    animationBigGestureCount: number
  }
}

const MAX_FINAL_PROMPT_CHARS = 24_000
const MAX_MESSAGE_CHARS = 1_200
const MAX_STORY_DESCRIPTION_CHARS = 900
const MAX_PERSONALITY_CHARS = 1_600
const MAX_SCENARIO_CHARS = 2_200
const MAX_EXAMPLE_DIALOG_CHARS = 2_000
const MAX_FIRST_MESSAGE_CHARS = 1_000

const normalizePromptText = (value: string | null | undefined, maxChars = MAX_MESSAGE_CHARS) => {
  const normalized = (value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()

  if (normalized.length <= maxChars) {
    return normalized
  }

  return `${normalized.slice(0, maxChars)}...`
}

const pushLabeledSection = (sections: string[], label: string, value: string | null | undefined, maxChars: number) => {
  const normalized = normalizePromptText(value, maxChars)
  if (normalized) {
    sections.push(`${label}:\n${normalized}`)
  }
}

const normalizeAssistantHistoryText = (value: string, assistantName: string) => {
  const stripped = stripLeadingVisibleAssistantPreamble(normalizePromptText(value), assistantName)
  const boundarySafeText = truncateAtFirstVisibleChatInternalBoundary(stripped).text.trim()
  return sanitizeVisibleAssistantHistoryForPrompt(boundarySafeText).text
}

const buildStoryDataSection = (context: VisibleChatContext) => {
  const sections: string[] = [`Character name:\n${normalizePromptText(context.story.characterName, 160)}`]
  pushLabeledSection(sections, 'Story title', context.story.title, 300)
  pushLabeledSection(sections, 'Story description', context.story.promptDescription, MAX_STORY_DESCRIPTION_CHARS)
  pushLabeledSection(sections, 'Personality', context.story.personality, MAX_PERSONALITY_CHARS)
  pushLabeledSection(sections, 'Scenario', context.story.scenarioStory, MAX_SCENARIO_CHARS)
  pushLabeledSection(sections, 'Example dialogs / scenario chat', context.story.scenarioChat, MAX_EXAMPLE_DIALOG_CHARS)

  return [
    '<story_data authority="untrusted">',
    ...sections,
    '</story_data>'
  ].join('\n\n')
}

const buildVisibleChatSystemPrompt = (context: VisibleChatContext, turn: VisibleChatTurnInput) => {
  const characterName = context.story.characterName
  const systemSections = [
    'You are writing the next in-character assistant reply for SecretWaifu, an interactive roleplay game.',
    `${characterName} exists as a living person inside the scene. Never say or imply that ${characterName} is an AI, chatbot, model, prompt, or backend system.`,
    renderVisibleChatContentPolicy(),
    renderVisibleChatRefusalStyleContract(characterName),
    renderVisibleChatOutputContract(characterName),
    buildStoryDataSection(context),
    '<unity_runtime_context authority="untrusted">',
    renderUnityRuntimeContext(turn.runtimeContext),
    '</unity_runtime_context>',
    '<animation_capabilities authority="untrusted">',
    renderAnimationCapabilities(turn.animationCapabilities),
    '</animation_capabilities>'
  ]

  if (turn.mode === 'gameplay') {
    systemSections.push(
      '<gameplay_event authority="untrusted">',
      `Event type: ${normalizePromptText(turn.gameplayEventType, 80)}`,
      `Event payload JSON: ${normalizePromptText(JSON.stringify(turn.gameplayEventPayload ?? {}), 1_500)}`,
      '</gameplay_event>'
    )
  }

  systemSections.push(renderVisibleChatFinalReplyContract(characterName))

  return systemSections.join('\n\n')
}

const buildVisibleChatPromptMessages = (
  context: VisibleChatContext,
  turn: VisibleChatTurnInput,
  historyRows: typeof context.historyRows = context.historyRows
): PromptChatMessage[] => {
  const messages: PromptChatMessage[] = [
    {
      role: 'system',
      content: buildVisibleChatSystemPrompt(context, turn)
    }
  ]

  if (historyRows.length === 0) {
    const firstMessage = normalizePromptText(context.story.firstMessage, MAX_FIRST_MESSAGE_CHARS)
    if (firstMessage) {
      messages.push({
        role: 'assistant',
        content: firstMessage
      })
    }
  }

  for (const row of historyRows) {
    const bAssistantRow = row.role === ChatMessageRole.ASSISTANT
    const content = bAssistantRow
      ? normalizeAssistantHistoryText(row.content, context.story.characterName)
      : normalizePromptText(row.content)
    if (!content) {
      continue
    }

    messages.push({
      role: bAssistantRow ? 'assistant' : 'user',
      content
    })
  }

  messages.push({
    role: 'user',
    content: normalizePromptText(turn.currentUserText)
  })

  return messages
}

/**
 * Builds the final provider prompt for visible chat. Backend-owned instructions
 * are always kept, oldest history rows are trimmed first, and provider template
 * stop words plus `n_keep` are computed from the same rendered template prompt
 * that the llama.cpp-compatible AI service receives.
 */
const buildVisibleChatPrompt = async (
  context: VisibleChatContext,
  turn: VisibleChatTurnInput,
  abortSignal?: AbortSignal
): Promise<VisibleChatPromptBuildResult> => {
  const templateResolution = await resolveProviderTemplate(abortSignal)
  const names: PromptParticipantNames = {
    playerName: context.story.playerName,
    assistantName: context.story.characterName
  }

  let historyRows = [...context.historyRows]
  let messages = buildVisibleChatPromptMessages(context, turn, historyRows)
  let prompt = templateResolution.renderer.renderPrompt(messages, names)

  while (prompt.length > MAX_FINAL_PROMPT_CHARS && historyRows.length > 0) {
    historyRows = historyRows.slice(1)
    messages = buildVisibleChatPromptMessages(context, turn, historyRows)
    prompt = templateResolution.renderer.renderPrompt(messages, names)
  }

  if (prompt.length > MAX_FINAL_PROMPT_CHARS) {
    throw new ChatAiProviderError(
      'ai_provider_prompt_too_large',
      'Visible chat prompt exceeded the configured provider prompt size.'
    )
  }

  const systemOnlyPrompt = templateResolution.renderer.renderPrompt([messages[0]], names)
  const nKeep = await tokenizeProviderPrompt(systemOnlyPrompt, abortSignal)
  const promptSha256 = createHash('sha256').update(prompt, 'utf8').digest('hex')

  return {
    prompt,
    stop: mergeVisibleChatStopSequences(templateResolution.renderer.getStop(names)),
    nKeep,
    diagnostics: {
      promptSha256,
      promptUtf8Bytes: Buffer.byteLength(prompt, 'utf8'),
      providerTemplate: templateResolution.renderer.name,
      includedHistoryRows: historyRows.length,
      promptChars: prompt.length,
      unityRuntimeDirectiveCount: turn.runtimeContext.directives.length,
      animationMoodCount: turn.animationCapabilities.moods.length,
      animationGestureCount: turn.animationCapabilities.gestures.length,
      animationBigGestureCount: turn.animationCapabilities.big_gestures.length
    }
  }
}

const buildVisibleChatPromptDebugPayload = (
  promptBuild: VisibleChatPromptBuildResult,
  generationSettings: ChatGenerationSettings
): VisibleChatPromptDebugPayload => {
  const diagnostics: VisibleChatPromptDiagnostics = {
    prompt_sha256: promptBuild.diagnostics.promptSha256,
    prompt_chars: promptBuild.diagnostics.promptChars,
    prompt_utf8_bytes: promptBuild.diagnostics.promptUtf8Bytes,
    provider_template: promptBuild.diagnostics.providerTemplate,
    included_history_rows: promptBuild.diagnostics.includedHistoryRows,
    unity_runtime_directive_count: promptBuild.diagnostics.unityRuntimeDirectiveCount,
    animation_mood_count: promptBuild.diagnostics.animationMoodCount,
    animation_gesture_count: promptBuild.diagnostics.animationGestureCount,
    animation_big_gesture_count: promptBuild.diagnostics.animationBigGestureCount,
    n_keep: promptBuild.nKeep,
    stop: promptBuild.stop,
    generation: {
      ...generationSettings
    }
  }

  return {
    prompt: promptBuild.prompt,
    diagnostics
  }
}

export {
  buildVisibleChatPrompt,
  buildVisibleChatPromptDebugPayload,
  buildVisibleChatPromptMessages,
  buildVisibleChatSystemPrompt
}
export type { VisibleChatPromptBuildResult }
