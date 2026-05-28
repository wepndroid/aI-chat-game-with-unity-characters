import { createHash } from 'node:crypto'
import { type AiProviderPlayerTier } from '../ai-provider-player-tier'
import {
  HELPER_GENERATION_PROFILES,
  resolveHelperGenerationSettings,
  type ChatGenerationSettings,
  type HelperGenerationProfile
} from '../chat/chat-generation-settings'
import { streamLlamaCompletion } from '../chat/llama-completion-stream-adapter'
import { resolveProviderTemplate, tokenizeProviderPrompt } from '../chat/provider-template-service'
import { type PromptChatMessage, type PromptParticipantNames } from '../chat/prompt/visible-chat-prompt-types'

type StructuredHelperPurpose = keyof typeof HELPER_GENERATION_PROFILES

type StructuredHelperGenerateInput = {
  purpose: StructuredHelperPurpose
  messages: PromptChatMessage[]
  userId: string
  providerPlayerTier: AiProviderPlayerTier
  sessionId: string
  requestId: string
  aiName?: string
  grammar?: string
  jsonSchema?: Record<string, unknown>
  debugPrompt: boolean
  abortSignal?: AbortSignal
}

type StructuredHelperPromptDiagnostics = {
  purpose: StructuredHelperPurpose
  prompt_sha256: string
  prompt_chars: number
  prompt_utf8_bytes: number
  provider_template: string
  provider_template_sha256: string
  message_count: number
  total_message_chars: number
  grammar_chars: number
  json_schema_utf8_bytes: number
  n_keep: number
  stop: string[]
  generation: ChatGenerationSettings
  content_max_chars: number
  provider_player_tier: AiProviderPlayerTier
}

type StructuredHelperPromptDebugPayload = {
  prompt: string
  diagnostics: StructuredHelperPromptDiagnostics
}

type StructuredHelperGenerateResult = {
  purpose: StructuredHelperPurpose
  content: string
  contentSha256: string
  provider: 'webhook'
  promptDebug: StructuredHelperPromptDebugPayload | null
}

const HELPER_OUTPUT_CAPS: Record<StructuredHelperPurpose, number> = {
  metadata_interpretation: 8_000,
  sex_phrases: 12_000,
  tts_emotion_decoration: 8_000
}

const DEFAULT_PLAYER_NAME = 'Player'
const DEFAULT_ASSISTANT_NAME = 'Assistant'

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

const getTotalMessageChars = (messages: PromptChatMessage[]) =>
  messages.reduce((total, message) => total + message.content.length, 0)

const getJsonSchemaBytes = (jsonSchema: Record<string, unknown> | undefined) =>
  jsonSchema ? Buffer.byteLength(JSON.stringify(jsonSchema), 'utf8') : 0

const resolveHelperSettings = async (input: {
  purpose: StructuredHelperPurpose
  messages: PromptChatMessage[]
  names: PromptParticipantNames
  abortSignal?: AbortSignal
  templateStop: string[]
  renderPrompt: (messages: PromptChatMessage[], names: PromptParticipantNames) => string
  profile?: HelperGenerationProfile
  tokenizePrompt?: (content: string, abortSignal?: AbortSignal) => Promise<number>
}) => {
  const profile = input.profile ?? HELPER_GENERATION_PROFILES[input.purpose]
  const nKeep = await (async () => {
    switch (profile.nKeepPolicy.kind) {
      case 'fixed':
        return profile.nKeepPolicy.value
      case 'tokenize_first_message': {
        const firstMessage = input.messages[0]
        if (!firstMessage) {
          throw new Error(`Helper profile ${input.purpose} requires at least one message for tokenization.`)
        }
        const firstMessagePrompt = input.renderPrompt([firstMessage], input.names)
        return (input.tokenizePrompt ?? tokenizeProviderPrompt)(firstMessagePrompt, input.abortSignal)
      }
      default: {
        const exhaustive: never = profile.nKeepPolicy
        throw new Error(`Unsupported helper n_keep policy: ${JSON.stringify(exhaustive)}`)
      }
    }
  })()

  return resolveHelperGenerationSettings(input.purpose, {
    nKeep,
    profile,
    templateStop: input.templateStop
  })
}

/**
 * Non-quota Unity helper LLM gateway.
 *
 * Unity owns the helper prompt text, grammar, schema, parsing, and gameplay
 * consequences. Backend owns only the authenticated provider boundary: session
 * ownership was checked by the route before this function, provider credentials
 * stay server-side, request fields are rendered through the active provider
 * template, and no quota, transcript, pending-turn, preview, or `/unity-state`
 * side effects happen here. If Unity changes the request/response contract,
 * this service, OpenAPI, and Unity DTOs must change together.
 */
const generateStructuredHelperContent = async (
  input: StructuredHelperGenerateInput
): Promise<StructuredHelperGenerateResult> => {
  const template = await resolveProviderTemplate(input.abortSignal)
  const names: PromptParticipantNames = {
    playerName: DEFAULT_PLAYER_NAME,
    assistantName: input.aiName?.trim() || DEFAULT_ASSISTANT_NAME
  }
  const prompt = template.renderer.renderPrompt(input.messages, names)
  const templateStop = template.renderer.getStop(names)
  const settings = await resolveHelperSettings({
    purpose: input.purpose,
    messages: input.messages,
    names,
    abortSignal: input.abortSignal,
    templateStop,
    renderPrompt: template.renderer.renderPrompt
  })

  const contentMaxChars = HELPER_OUTPUT_CAPS[input.purpose]
  const result = await streamLlamaCompletion({
    requestId: input.requestId,
    prompt,
    userId: input.userId,
    playerTier: input.providerPlayerTier,
    settings,
    structuredOutput: {
      grammar: input.grammar,
      jsonSchema: input.jsonSchema
    },
    maxGeneratedContentChars: contentMaxChars,
    abortSignal: input.abortSignal
  })

  const diagnostics: StructuredHelperPromptDiagnostics = {
    purpose: input.purpose,
    prompt_sha256: sha256(prompt),
    prompt_chars: prompt.length,
    prompt_utf8_bytes: Buffer.byteLength(prompt, 'utf8'),
    provider_template: template.renderer.name,
    provider_template_sha256: sha256(template.rawTemplate),
    message_count: input.messages.length,
    total_message_chars: getTotalMessageChars(input.messages),
    grammar_chars: input.grammar?.length ?? 0,
    json_schema_utf8_bytes: getJsonSchemaBytes(input.jsonSchema),
    n_keep: settings.n_keep,
    stop: settings.stop,
    generation: settings,
    content_max_chars: contentMaxChars,
    provider_player_tier: input.providerPlayerTier
  }

  return {
    purpose: input.purpose,
    content: result.content,
    contentSha256: sha256(result.content),
    provider: result.provider,
    promptDebug: input.debugPrompt
      ? {
          prompt,
          diagnostics
        }
      : null
  }
}

export { generateStructuredHelperContent, resolveHelperSettings }
export type {
  StructuredHelperGenerateInput,
  StructuredHelperGenerateResult,
  StructuredHelperPromptDebugPayload,
  StructuredHelperPromptDiagnostics,
  StructuredHelperPurpose
}
