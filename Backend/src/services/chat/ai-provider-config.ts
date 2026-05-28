import { ChatAiProviderError } from './chat-ai-error'

type AiProviderConfig = {
  baseUrl: string
  completionUrl: string
  templateUrl: string
  tokenizeUrl: string
  bearerToken: string
}

const appendProviderPath = (baseUrl: string, path: string) => {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(path.replace(/^\//, ''), normalizedBase).toString()
}

const requireHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Unsupported protocol.')
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    throw new ChatAiProviderError(
      'ai_provider_configuration_missing',
      'AI provider base URL is invalid.'
    )
  }
}

/**
 * Backend-only provider configuration for the llama.cpp-compatible AI service.
 *
 * Unity must never receive this URL or bearer token. Increment 06C replaces the
 * older completion-specific webhook setting with a provider base URL so completion,
 * template discovery, and tokenization stay behind one backend anti-corruption layer.
 */
const resolveAiProviderConfig = (): AiProviderConfig => {
  const baseUrl = process.env.CHAT_AI_PROVIDER_BASE_URL?.trim() ?? ''
  const bearerToken = process.env.CHAT_AI_BEARER_TOKEN?.trim() ?? ''

  if (!baseUrl || !bearerToken) {
    throw new ChatAiProviderError(
      'ai_provider_configuration_missing',
      'AI provider configuration is missing.'
    )
  }

  const normalizedBaseUrl = requireHttpUrl(baseUrl)
  return {
    baseUrl: normalizedBaseUrl,
    completionUrl: appendProviderPath(normalizedBaseUrl, '/completion'),
    templateUrl: appendProviderPath(normalizedBaseUrl, '/template'),
    tokenizeUrl: appendProviderPath(normalizedBaseUrl, '/tokenize'),
    bearerToken
  }
}

export { resolveAiProviderConfig }
export type { AiProviderConfig }
