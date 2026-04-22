import { setTimeout as delay } from 'node:timers/promises'

type GenerateAssistantReplyInput = {
  userMessage: string
  requestId: string
  sessionId: string
  storyId: string
  userId: string
  forceFailure?: boolean
}

type GenerateAssistantReplyResult = {
  content: string
  provider: 'fallback' | 'webhook'
}

class ChatAiProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatAiProviderError'
  }
}

const WEBHOOK_TIMEOUT_MS = 18_000

const toShortEchoReply = (inputMessage: string) => {
  const normalized = inputMessage.trim().replace(/\s+/g, ' ')
  const clipped = normalized.length > 480 ? `${normalized.slice(0, 480)}...` : normalized
  return `I heard you: ${clipped}`
}

const callWebhookProvider = async (
  url: string,
  input: GenerateAssistantReplyInput
): Promise<GenerateAssistantReplyResult> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: input.userId,
        sessionId: input.sessionId,
        storyId: input.storyId,
        requestId: input.requestId,
        message: input.userMessage
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      throw new ChatAiProviderError(`AI provider request failed (${response.status}).`)
    }

    const payload = (await response.json().catch(() => null)) as
      | { reply?: string; content?: string }
      | null

    const rawReply = payload?.reply ?? payload?.content ?? ''
    const normalizedReply = rawReply.trim()

    if (!normalizedReply) {
      throw new ChatAiProviderError('AI provider returned an empty reply.')
    }

    return {
      content: normalizedReply.slice(0, 8000),
      provider: 'webhook'
    }
  } catch (error) {
    if (error instanceof ChatAiProviderError) {
      throw error
    }

    throw new ChatAiProviderError(error instanceof Error ? error.message : 'AI provider request failed.')
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Chat completion provider for `/api/chat/send`.
 * - Optional webhook provider via `CHAT_AI_WEBHOOK_URL`.
 * - Safe deterministic fallback when webhook is not configured.
 */
const generateAssistantReply = async (
  input: GenerateAssistantReplyInput
): Promise<GenerateAssistantReplyResult> => {
  if (input.forceFailure) {
    // Tiny async boundary so failure path behaves like real provider latency.
    await delay(10)
    throw new ChatAiProviderError('Forced AI failure.')
  }

  const webhookUrl = process.env.CHAT_AI_WEBHOOK_URL?.trim()
  if (webhookUrl) {
    return callWebhookProvider(webhookUrl, input)
  }

  return {
    content: toShortEchoReply(input.userMessage),
    provider: 'fallback'
  }
}

export { ChatAiProviderError, generateAssistantReply }
export type { GenerateAssistantReplyInput, GenerateAssistantReplyResult }
