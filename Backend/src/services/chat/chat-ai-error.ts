type ChatAiProviderFailureReason =
  | 'ai_provider_configuration_missing'
  | 'ai_provider_connect_timeout'
  | 'ai_provider_idle_timeout'
  | 'ai_provider_total_timeout'
  | 'ai_provider_http_error'
  | 'ai_provider_invalid_sse'
  | 'ai_provider_empty_reply'
  | 'ai_provider_empty_stream'
  | 'ai_provider_scaffold_only_reply'
  | 'ai_provider_internal_prompt_boundary_only'
  | 'ai_provider_content_limit_exceeded'
  | 'ai_provider_template_unavailable'
  | 'ai_provider_template_unsupported'
  | 'ai_provider_tokenize_failed'
  | 'ai_provider_prompt_too_large'
  | 'ai_provider_request_failed'
  | 'ai_provider_forced_failure'
  | 'client_disconnected'

type ChatAiProviderErrorOptions = {
  statusCode?: number
  cause?: unknown
  details?: Record<string, unknown>
}

/**
 * Sanitized provider-boundary error used by chat routes.
 * The `reason` value is safe to expose in API details; the original provider
 * response body, auth header, and token values must stay out of this type.
 */
class ChatAiProviderError extends Error {
  readonly reason: ChatAiProviderFailureReason
  readonly statusCode: number | null
  readonly details: Record<string, unknown>

  constructor(reason: ChatAiProviderFailureReason, message: string, options: ChatAiProviderErrorOptions = {}) {
    super(message)
    this.name = 'ChatAiProviderError'
    this.reason = reason
    this.statusCode = options.statusCode ?? null
    this.details = options.details ?? {}
    this.cause = options.cause
  }
}

const getChatAiProviderErrorReason = (error: unknown) =>
  error instanceof ChatAiProviderError ? error.reason : 'ai_provider_request_failed'

const getChatAiProviderErrorDetails = (error: unknown) => {
  const reason = getChatAiProviderErrorReason(error)
  if (!(error instanceof ChatAiProviderError)) {
    return {
      error_reason: reason
    }
  }

  return {
    ...error.details,
    ...(error.statusCode === null ? {} : { provider_status_code: error.statusCode }),
    error_reason: reason
  }
}

export { ChatAiProviderError, getChatAiProviderErrorDetails, getChatAiProviderErrorReason }
export type { ChatAiProviderFailureReason }
