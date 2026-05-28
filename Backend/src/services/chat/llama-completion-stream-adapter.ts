import { ChatAiProviderError, type ChatAiProviderFailureReason } from './chat-ai-error'
import { type ChatGenerationSettings } from './chat-generation-settings'
import { resolveAiProviderConfig } from './ai-provider-config'
import { type AiProviderPlayerTier } from '../ai-provider-player-tier'

type StreamLlamaCompletionInput = {
  requestId: string
  prompt: string
  userId: string
  playerTier: AiProviderPlayerTier
  settings: ChatGenerationSettings
  structuredOutput?: {
    grammar?: string
    jsonSchema?: Record<string, unknown>
  }
  maxGeneratedContentChars?: number
  abortSignal?: AbortSignal
  onToken?: (token: string) => StreamTokenDecision | void | Promise<StreamTokenDecision | void>
}

type StreamTokenDecision =
  | 'continue'
  | 'stop_success'
  | {
      action: 'continue' | 'stop_success'
      reason?: string | null
    }

type StreamLlamaCompletionResult = {
  content: string
  provider: 'webhook'
  diagnostics: LlamaCompletionStreamDiagnostics
}

type LlamaCompletionStreamDiagnostics = {
  request_id: string
  attempt: number
  provider: 'webhook'
  provider_event_count: number
  provider_data_event_count: number
  provider_keepalive_count: number
  provider_content_chunk_count: number
  provider_raw_content_chars: number
  provider_sanitized_content_chars: number
  provider_first_byte_ms: number | null
  provider_first_content_ms: number | null
  provider_saw_stop: boolean
  provider_finish_reason: string | null
  provider_stopped_by_consumer: boolean
  provider_stop_reason: string | null
  provider_player_tier: AiProviderPlayerTier
}

type LlamaCompletionRequestBody = ChatGenerationSettings & {
  prompt: string
  player_id: string
  player_tier: AiProviderPlayerTier
  grammar?: string
  json_schema?: Record<string, unknown>
}

const CONNECT_TIMEOUT_MS = 10_000
const IDLE_TIMEOUT_MS = 30_000
const TOTAL_TIMEOUT_MS = 180_000
const MAX_GENERATED_CONTENT_CHARS = 8_000

const sanitizeModelText = (value: string) =>
  (typeof (value as string & { toWellFormed?: () => string }).toWellFormed === 'function'
    ? (value as string & { toWellFormed: () => string }).toWellFormed()
    : value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

const extractChunkContent = (data: Record<string, unknown>) => {
  const directContentKeys = ['content', 'text', 'token', 'response'] as const
  for (const key of directContentKeys) {
    const value = data[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  const choices = data.choices
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') {
        continue
      }
      const mappedChoice = choice as Record<string, unknown>
      const delta = mappedChoice.delta
      if (delta && typeof delta === 'object') {
        const deltaContent = (delta as Record<string, unknown>).content
        if (typeof deltaContent === 'string' && deltaContent.length > 0) {
          return deltaContent
        }
      }
      const message = mappedChoice.message
      if (message && typeof message === 'object') {
        const messageContent = (message as Record<string, unknown>).content
        if (typeof messageContent === 'string' && messageContent.length > 0) {
          return messageContent
        }
      }
      if (typeof mappedChoice.text === 'string' && mappedChoice.text.length > 0) {
        return mappedChoice.text
      }
    }
  }

  return ''
}

const extractFinishReason = (data: Record<string, unknown>) => {
  if (typeof data.finish_reason === 'string' && data.finish_reason.trim().length > 0) {
    return data.finish_reason.trim()
  }

  const choices = data.choices
  if (!Array.isArray(choices)) {
    return null
  }

  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') {
      continue
    }
    const reason = (choice as Record<string, unknown>).finish_reason
    if (typeof reason === 'string' && reason.trim().length > 0) {
      return reason.trim()
    }
  }

  return null
}

const isAbortLikeError = (error: unknown) => error instanceof Error && error.name === 'AbortError'

const normalizeStreamTokenDecision = (
  decision: StreamTokenDecision | void
): { action: 'continue' | 'stop_success'; reason: string | null } => {
  if (!decision || decision === 'continue') {
    return { action: 'continue', reason: null }
  }
  if (decision === 'stop_success') {
    return { action: 'stop_success', reason: 'consumer_stop' }
  }

  return {
    action: decision.action,
    reason: decision.reason ?? (decision.action === 'stop_success' ? 'consumer_stop' : null)
  }
}

/**
 * Builds the provider-only `/completion` payload. The snake_case field names
 * are core's current contract; keeping them here prevents Unity/public routes
 * from depending on provider transport details.
 */
const buildLlamaCompletionRequestBody = (
  input: Pick<StreamLlamaCompletionInput, 'requestId' | 'prompt' | 'userId' | 'playerTier' | 'settings' | 'structuredOutput'>
): LlamaCompletionRequestBody => ({
  prompt: input.prompt,
  player_id: input.userId,
  player_tier: input.playerTier,
  ...input.settings,
  ...(input.structuredOutput?.grammar ? { grammar: input.structuredOutput.grammar } : {}),
  ...(input.structuredOutput?.jsonSchema ? { json_schema: input.structuredOutput.jsonSchema } : {})
})

/**
 * The upstream llama.cpp-compatible completion endpoint returns SSE blocks:
 * `data: {...}\n\n` with token text in `content` and `stop: true` at the end.
 * This parser keeps the provider contract isolated from Unity's SSE contract.
 */
const streamProviderSse = async (
  response: Response,
  input: {
    maxGeneratedContentChars: number
    diagnostics: LlamaCompletionStreamDiagnostics
    recordProviderActivity: (byteLength: number) => void
    recordFirstProviderContent: () => void
    onToken?: (token: string) => StreamTokenDecision | void | Promise<StreamTokenDecision | void>
  }
) => {
  if (!response.body) {
    throw new ChatAiProviderError('ai_provider_invalid_sse', 'AI provider SSE response body is missing.', {
      details: input.diagnostics
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let pendingDataLines: string[] = []
  let content = ''
  let sawStop = false
  let bConsumerStopped = false

  const appendToken = async (rawToken: string) => {
    input.diagnostics.provider_raw_content_chars += rawToken.length
    const token = sanitizeModelText(rawToken)
    if (!token) {
      return
    }

    const remaining = input.maxGeneratedContentChars - content.length
    if (remaining <= 0) {
      throw new ChatAiProviderError(
        'ai_provider_content_limit_exceeded',
        'AI provider reply exceeded the maximum persisted size.',
        { details: input.diagnostics }
      )
    }

    const boundedToken = token.length > remaining ? token.slice(0, remaining) : token
    content += boundedToken
    input.recordFirstProviderContent()
    input.diagnostics.provider_content_chunk_count += 1
    input.diagnostics.provider_sanitized_content_chars += boundedToken.length
    const tokenDecision = normalizeStreamTokenDecision(await input.onToken?.(boundedToken))
    if (tokenDecision.action === 'stop_success') {
      bConsumerStopped = true
      sawStop = true
      input.diagnostics.provider_stopped_by_consumer = true
      input.diagnostics.provider_stop_reason = tokenDecision.reason
      return
    }

    if (token.length > remaining) {
      throw new ChatAiProviderError(
        'ai_provider_content_limit_exceeded',
        'AI provider reply exceeded the maximum persisted size.',
        { details: input.diagnostics }
      )
    }
  }

  const handleDataPayload = async (rawPayload: string) => {
    const payload = rawPayload.trim()
    if (!payload) {
      return
    }
    input.diagnostics.provider_data_event_count += 1
    if (payload === '[DONE]') {
      sawStop = true
      input.diagnostics.provider_saw_stop = true
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      // Some SSE providers emit raw token text. The current provider sends JSON,
      // but accepting raw data makes the adapter robust without changing Unity.
      await appendToken(payload)
      return
    }

    if (!parsed || typeof parsed !== 'object') {
      return
    }

    const data = parsed as Record<string, unknown>
    if (typeof data.error === 'string' && data.error.trim().length > 0) {
      throw new ChatAiProviderError('ai_provider_request_failed', 'AI provider streamed an error chunk.', {
        details: input.diagnostics
      })
    }

    const finishReason = extractFinishReason(data)
    if (finishReason) {
      input.diagnostics.provider_finish_reason = finishReason
    }

    const extractedContent = extractChunkContent(data)
    if (extractedContent) {
      await appendToken(extractedContent)
    }

    if (data.stop === true) {
      sawStop = true
      input.diagnostics.provider_saw_stop = true
    }
  }

  const dispatchEvent = async () => {
    if (pendingDataLines.length === 0) {
      return
    }

    const dataPayload = pendingDataLines.join('\n')
    pendingDataLines = []
    input.diagnostics.provider_event_count += 1
    await handleDataPayload(dataPayload)
  }

  const processLine = async (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line.length === 0) {
      await dispatchEvent()
      return
    }
    if (line.startsWith(':')) {
      // SSE comments are provider liveness frames, never application data.
      // The idle deadline is renewed when the chunk bytes arrive; parsing the
      // comment separately keeps the diagnostic count tied to the SSE contract.
      input.diagnostics.provider_keepalive_count += 1
      return
    }

    const colonIndex = line.indexOf(':')
    const fieldName = colonIndex === -1 ? line : line.slice(0, colonIndex)
    const fieldValue = colonIndex === -1 ? '' : line.slice(colonIndex + 1).replace(/^ /, '')

    if (fieldName === 'data') {
      pendingDataLines.push(fieldValue)
    }
  }

  const processBuffer = async (flushRemainder: boolean) => {
    while (!sawStop) {
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) {
        break
      }

      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      await processLine(line)
    }

    if (flushRemainder && !sawStop) {
      if (buffer.length > 0) {
        await processLine(buffer)
        buffer = ''
      }
      await dispatchEvent()
    }
  }

  try {
    while (!sawStop) {
      const { value, done } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        await processBuffer(true)
        break
      }

      input.recordProviderActivity(value.byteLength)
      buffer += decoder.decode(value, { stream: true })
      await processBuffer(false)
    }
  } finally {
    if (bConsumerStopped) {
      try {
        await reader.cancel()
      } catch {
        // The reader may already be closed after the provider sent a final
        // chunk. Consumer-stop is a successful early finish, so cancellation
        // errors here are intentionally ignored.
      }
    }
    reader.releaseLock()
  }

  const normalized = sanitizeModelText(content).trim()
  if (!normalized) {
    throw new ChatAiProviderError('ai_provider_empty_stream', 'AI provider returned an empty streamed reply.', {
      details: input.diagnostics
    })
  }

  return normalized
}

/**
 * Anti-corruption adapter for a llama.cpp-compatible completion streaming API.
 * Provider credentials and URL stay server-side. The request body deliberately
 * uses `n_predict`, `player_id`, and `stream=true`; changing those names is a
 * backend-to-provider contract change and must not require a Unity client update.
 */
const streamLlamaCompletion = async (input: StreamLlamaCompletionInput): Promise<StreamLlamaCompletionResult> => {
  const providerConfig = resolveAiProviderConfig()
  const controller = new AbortController()
  let abortReason: ChatAiProviderFailureReason | null = null
  let headerTimeout: NodeJS.Timeout | null = null
  let idleTimeout: NodeJS.Timeout | null = null
  let totalTimeout: NodeJS.Timeout | null = null
  const diagnostics: LlamaCompletionStreamDiagnostics = {
    request_id: input.requestId,
    attempt: 1,
    provider: 'webhook',
    provider_event_count: 0,
    provider_data_event_count: 0,
    provider_keepalive_count: 0,
    provider_content_chunk_count: 0,
    provider_raw_content_chars: 0,
    provider_sanitized_content_chars: 0,
    provider_first_byte_ms: null,
    provider_first_content_ms: null,
    provider_saw_stop: false,
    provider_finish_reason: null,
    provider_stopped_by_consumer: false,
    provider_stop_reason: null,
    provider_player_tier: input.playerTier
  }

  const abortFor = (reason: ChatAiProviderFailureReason) => {
    if (!controller.signal.aborted) {
      abortReason = reason
      controller.abort()
    }
  }

  const resetIdleDeadline = () => {
    if (idleTimeout) {
      clearTimeout(idleTimeout)
    }
    idleTimeout = setTimeout(() => abortFor('ai_provider_idle_timeout'), IDLE_TIMEOUT_MS)
  }

  const onClientAbort = () => abortFor('client_disconnected')
  input.abortSignal?.addEventListener('abort', onClientAbort, { once: true })

  try {
    if (input.abortSignal?.aborted) {
      throw new ChatAiProviderError('client_disconnected', 'Client disconnected before AI generation started.', {
        details: diagnostics
      })
    }

    headerTimeout = setTimeout(() => abortFor('ai_provider_connect_timeout'), CONNECT_TIMEOUT_MS)
    totalTimeout = setTimeout(() => abortFor('ai_provider_total_timeout'), TOTAL_TIMEOUT_MS)
    const providerRequestStartedAt = Date.now()
    const recordElapsedOnce = (field: 'provider_first_byte_ms' | 'provider_first_content_ms') => {
      if (diagnostics[field] === null) {
        diagnostics[field] = Date.now() - providerRequestStartedAt
      }
    }
    const recordProviderActivity = (byteLength: number) => {
      // Core may send SSE comments before the first token while a request waits
      // in queue. Any received bytes prove the upstream stream is alive, so they
      // must renew SecretWaifuWEB's provider idle deadline.
      resetIdleDeadline()
      if (byteLength > 0) {
        recordElapsedOnce('provider_first_byte_ms')
      }
    }

    const response = await fetch(providerConfig.completionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerConfig.bearerToken}`
      },
      body: JSON.stringify(buildLlamaCompletionRequestBody(input)),
      signal: controller.signal
    })

    if (headerTimeout) {
      clearTimeout(headerTimeout)
      headerTimeout = null
    }

    if (!response.ok) {
      throw new ChatAiProviderError(
        'ai_provider_http_error',
        `AI provider request failed (${response.status}).`,
        {
          statusCode: response.status,
          details: diagnostics
        }
      )
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('text/event-stream')) {
      throw new ChatAiProviderError('ai_provider_invalid_sse', 'AI provider returned a non-SSE response.', {
        details: diagnostics
      })
    }

    resetIdleDeadline()
    const content = await streamProviderSse(response, {
      maxGeneratedContentChars: input.maxGeneratedContentChars ?? MAX_GENERATED_CONTENT_CHARS,
      diagnostics,
      recordProviderActivity,
      recordFirstProviderContent: () => recordElapsedOnce('provider_first_content_ms'),
      onToken: input.onToken
    })

    return {
      content,
      provider: 'webhook',
      diagnostics
    }
  } catch (error) {
    if (error instanceof ChatAiProviderError) {
      throw error
    }

    if (abortReason) {
      throw new ChatAiProviderError(abortReason, 'AI provider stream was aborted.', {
        cause: error,
        details: diagnostics
      })
    }

    if (isAbortLikeError(error)) {
      throw new ChatAiProviderError('ai_provider_request_failed', 'AI provider request was aborted.', {
        cause: error,
        details: diagnostics
      })
    }

    throw new ChatAiProviderError('ai_provider_request_failed', 'AI provider request failed.', {
      cause: error,
      details: diagnostics
    })
  } finally {
    if (headerTimeout) {
      clearTimeout(headerTimeout)
    }
    if (idleTimeout) {
      clearTimeout(idleTimeout)
    }
    if (totalTimeout) {
      clearTimeout(totalTimeout)
    }
    input.abortSignal?.removeEventListener('abort', onClientAbort)
  }
}

export { buildLlamaCompletionRequestBody, streamLlamaCompletion }
export type {
  LlamaCompletionRequestBody,
  LlamaCompletionStreamDiagnostics,
  StreamLlamaCompletionInput,
  StreamLlamaCompletionResult,
  StreamTokenDecision
}
