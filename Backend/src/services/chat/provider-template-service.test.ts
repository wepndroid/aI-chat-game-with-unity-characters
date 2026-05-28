import assert from 'node:assert/strict'
import test from 'node:test'

import { ChatAiProviderError } from './chat-ai-error'
import {
  buildTokenizationCacheKey,
  tokenizeProviderPrompt
} from './provider-template-service'
import { resolveAiProviderConfig } from './ai-provider-config'

const installProviderConfig = (t: test.TestContext) => {
  const previousBaseUrl = process.env.CHAT_AI_PROVIDER_BASE_URL
  const previousBearerToken = process.env.CHAT_AI_BEARER_TOKEN
  process.env.CHAT_AI_PROVIDER_BASE_URL = 'https://core.secretwaifu.test'
  process.env.CHAT_AI_BEARER_TOKEN = 'test-provider-token'

  t.after(() => {
    if (previousBaseUrl === undefined) {
      delete process.env.CHAT_AI_PROVIDER_BASE_URL
    } else {
      process.env.CHAT_AI_PROVIDER_BASE_URL = previousBaseUrl
    }

    if (previousBearerToken === undefined) {
      delete process.env.CHAT_AI_BEARER_TOKEN
    } else {
      process.env.CHAT_AI_BEARER_TOKEN = previousBearerToken
    }
  })
}

const installFetchMock = (
  t: test.TestContext,
  handler: (...args: Parameters<typeof fetch>) => Promise<Response> | Response
) => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (...args) => handler(...args)

  t.after(() => {
    globalThis.fetch = previousFetch
  })
}

const tokenResponse = (tokens: number[]) => new Response(JSON.stringify({ tokens }))

test('provider tokenization caches identical prompt content', async t => {
  installProviderConfig(t)
  let fetchCount = 0
  installFetchMock(t, async () => {
    fetchCount += 1
    return tokenResponse([1, 2, 3])
  })

  const first = await tokenizeProviderPrompt('cache me once')
  const second = await tokenizeProviderPrompt('cache me once')

  assert.equal(first, 3)
  assert.equal(second, 3)
  assert.equal(fetchCount, 1)
})

test('provider tokenization coalesces concurrent identical prompt content', async t => {
  installProviderConfig(t)
  let fetchCount = 0
  let resolveResponse!: (response: Response) => void
  installFetchMock(t, async () => {
    fetchCount += 1
    return new Promise<Response>(resolve => {
      resolveResponse = resolve
    })
  })

  const first = tokenizeProviderPrompt('concurrent cache me')
  const second = tokenizeProviderPrompt('concurrent cache me')
  resolveResponse(tokenResponse([1, 2, 3, 4]))

  assert.equal(await first, 4)
  assert.equal(await second, 4)
  assert.equal(fetchCount, 1)
})

test('provider tokenization uses different cache entries for different content', async t => {
  installProviderConfig(t)
  let fetchCount = 0
  installFetchMock(t, async () => {
    fetchCount += 1
    return tokenResponse([1])
  })

  await tokenizeProviderPrompt('first unique prompt')
  await tokenizeProviderPrompt('second unique prompt')

  assert.equal(fetchCount, 2)
})

test('provider tokenization does not cache failed provider responses', async t => {
  installProviderConfig(t)
  let fetchCount = 0
  installFetchMock(t, async () => {
    fetchCount += 1
    if (fetchCount === 1) {
      return new Response('unavailable', { status: 503 })
    }
    return tokenResponse([1, 2])
  })

  await assert.rejects(
    () => tokenizeProviderPrompt('retry after failure'),
    error => {
      assert.ok(error instanceof ChatAiProviderError)
      assert.equal(error.reason, 'ai_provider_tokenize_failed')
      return true
    }
  )
  assert.equal(await tokenizeProviderPrompt('retry after failure'), 2)
  assert.equal(fetchCount, 2)
})

test('provider tokenization cache key redacts raw prompt content', t => {
  installProviderConfig(t)
  const rawPrompt = 'system prompt text that must never be stored as a cache key'
  const cacheKey = buildTokenizationCacheKey(resolveAiProviderConfig(), rawPrompt)

  assert.equal(cacheKey.includes(rawPrompt), false)
  assert.match(cacheKey, /^tokenize:https:\/\/core\.secretwaifu\.test\/tokenize:[a-f0-9]{64}$/)
})
