import { createHash } from 'node:crypto'
import { ChatAiProviderError } from './chat-ai-error'
import { resolveAiProviderConfig, type AiProviderConfig } from './ai-provider-config'
import { createAsyncTtlCache } from '../../lib/async-ttl-cache'
import {
  resolveProviderChatTemplateRenderer,
  type ProviderTemplateRenderer
} from './prompt/provider-chat-template-renderer'

type ProviderTemplateResolution = {
  rawTemplate: string
  renderer: ProviderTemplateRenderer
}

const PREFLIGHT_TIMEOUT_MS = 15_000
const TEMPLATE_CACHE_TTL_MS = 10 * 60 * 1000
const TOKENIZATION_CACHE_TTL_MS = 10 * 60 * 1000
const TOKENIZATION_CACHE_MAX_ENTRIES = 512

let cachedTemplate: { value: ProviderTemplateResolution; expiresAt: number } | null = null
const tokenizationCache = createAsyncTtlCache<string, number>({
  ttlMs: TOKENIZATION_CACHE_TTL_MS,
  maxEntries: TOKENIZATION_CACHE_MAX_ENTRIES
})

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

const buildTokenizationCacheKey = (config: Pick<AiProviderConfig, 'tokenizeUrl'>, content: string) =>
  `tokenize:${config.tokenizeUrl}:${sha256(content)}`

const withTimeoutSignal = <T>(
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>
) =>
  new Promise<T>((resolve, reject) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    const onParentAbort = () => controller.abort()
    parentSignal?.addEventListener('abort', onParentAbort, { once: true })

    work(controller.signal)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeout)
        parentSignal?.removeEventListener('abort', onParentAbort)
      })
  })

const awaitWithAbort = <T>(promise: Promise<T>, abortSignal: AbortSignal | undefined) =>
  new Promise<T>((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new ChatAiProviderError('client_disconnected', 'Client disconnected before AI provider preflight completed.'))
      return
    }

    const onAbort = () => {
      reject(new ChatAiProviderError('client_disconnected', 'Client disconnected during AI provider preflight.'))
    }
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        abortSignal?.removeEventListener('abort', onAbort)
      })
  })

const fetchProviderJson = async (
  url: string,
  payload: Record<string, unknown>,
  abortSignal: AbortSignal | undefined,
  failureReason: 'ai_provider_template_unavailable' | 'ai_provider_tokenize_failed'
) => {
  const config = resolveAiProviderConfig()
  let response: Response
  try {
    response = await withTimeoutSignal(PREFLIGHT_TIMEOUT_MS, abortSignal, (signal) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.bearerToken}`
        },
        body: JSON.stringify(payload),
        signal
      })
    )
  } catch (error) {
    throw new ChatAiProviderError(failureReason, 'AI provider preflight request failed.', { cause: error })
  }

  if (!response.ok) {
    throw new ChatAiProviderError(
      failureReason,
      `AI provider preflight request failed (${response.status}).`,
      { statusCode: response.status }
    )
  }

  try {
    return (await response.json()) as unknown
  } catch (error) {
    throw new ChatAiProviderError(failureReason, 'AI provider preflight returned invalid JSON.', { cause: error })
  }
}

const extractTemplate = (body: unknown): string => {
  if (typeof body === 'string') {
    return body
  }
  if (!body || typeof body !== 'object') {
    return ''
  }

  const objectBody = body as Record<string, unknown>
  const directTemplate = objectBody.template ?? objectBody.chat_template
  if (typeof directTemplate === 'string') {
    return directTemplate
  }

  const nestedData = objectBody.data
  if (nestedData && typeof nestedData === 'object') {
    const nestedTemplate = (nestedData as Record<string, unknown>).template
    if (typeof nestedTemplate === 'string') {
      return nestedTemplate
    }
  }

  return ''
}

const extractTokenCount = (body: unknown): number => {
  const readTokens = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.length
    }
    return null
  }

  if (body && typeof body === 'object') {
    const objectBody = body as Record<string, unknown>
    const direct = readTokens(objectBody.tokens)
    if (direct !== null) {
      return direct
    }

    const nestedData = objectBody.data
    if (nestedData && typeof nestedData === 'object') {
      const nested = readTokens((nestedData as Record<string, unknown>).tokens)
      if (nested !== null) {
        return nested
      }
    }
  }

  throw new ChatAiProviderError('ai_provider_tokenize_failed', 'AI provider tokenize response is missing tokens.')
}

/**
 * Loads and caches the active provider template. The backend intentionally
 * has no silent fallback renderer: template identity controls stop words,
 * prompt delimiters, and `n_keep` tokenization, so unknown templates are
 * provider-contract failures that Unity should see as sanitized API errors.
 */
const resolveProviderTemplate = async (abortSignal?: AbortSignal): Promise<ProviderTemplateResolution> => {
  const now = Date.now()
  if (cachedTemplate && cachedTemplate.expiresAt > now) {
    return cachedTemplate.value
  }

  const config = resolveAiProviderConfig()
  const body = await fetchProviderJson(
    config.templateUrl,
    {},
    abortSignal,
    'ai_provider_template_unavailable'
  )
  const rawTemplate = extractTemplate(body)
  if (!rawTemplate.trim()) {
    throw new ChatAiProviderError(
      'ai_provider_template_unavailable',
      'AI provider template response is empty.'
    )
  }

  const value = {
    rawTemplate,
    renderer: resolveProviderChatTemplateRenderer(rawTemplate)
  }
  cachedTemplate = {
    value,
    expiresAt: now + TEMPLATE_CACHE_TTL_MS
  }
  return value
}

const tokenizeProviderPrompt = async (content: string, abortSignal?: AbortSignal): Promise<number> => {
  const config = resolveAiProviderConfig()
  const cacheKey = buildTokenizationCacheKey(config, content)
  return awaitWithAbort(
    tokenizationCache.get(cacheKey, async () => {
      const body = await fetchProviderJson(
        config.tokenizeUrl,
        { content },
        undefined,
        'ai_provider_tokenize_failed'
      )
      return extractTokenCount(body)
    }),
    abortSignal
  )
}

export { buildTokenizationCacheKey, resolveProviderTemplate, tokenizeProviderPrompt }
export type { ProviderTemplateResolution }
