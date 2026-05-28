import assert from 'node:assert/strict'
import test from 'node:test'

import { ChatAiProviderError } from './chat-ai-error'
import { buildLlamaCompletionRequestBody, streamLlamaCompletion } from './llama-completion-stream-adapter'
import { type ChatGenerationSettings } from './chat-generation-settings'

const makeSettings = (): ChatGenerationSettings => ({
  stream: true,
  temperature: 0.9,
  top_k: 50,
  top_p: 0.93,
  min_p: 0.05,
  n_predict: 512,
  n_keep: 128,
  repeat_penalty: 1.1,
  repeat_last_n: 8,
  penalize_nl: true,
  presence_penalty: 0,
  frequency_penalty: 0,
  typical_p: 1,
  mirostat: 0,
  mirostat_tau: 5,
  mirostat_eta: 0.1,
  seed: 465527271,
  ignore_eos: false,
  n_probs: 0,
  cache_prompt: true,
  stop: ['</s>']
})

const providerSseResponse = (chunks: string[]) => {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      }
    }),
    {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8'
      }
    }
  )
}

const delayedProviderSseResponse = (chunks: Array<{ delayMs: number; chunk: string }>) => {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        let latestDelayMs = 0
        for (const { delayMs, chunk } of chunks) {
          latestDelayMs = Math.max(latestDelayMs, delayMs)
          setTimeout(() => {
            controller.enqueue(encoder.encode(chunk))
          }, delayMs)
        }

        setTimeout(() => {
          controller.close()
        }, latestDelayMs + 1)
      }
    }),
    {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8'
      }
    }
  )
}

const flushAsyncWork = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

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

const installFetchResponse = (t: test.TestContext, response: Response) => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => response

  t.after(() => {
    globalThis.fetch = previousFetch
  })
}

test('llama completion request body includes the trusted provider player tier beside player id', () => {
  const body = buildLlamaCompletionRequestBody({
    requestId: 'request-1',
    prompt: 'Rendered prompt',
    userId: 'user-1',
    playerTier: 'premium',
    settings: makeSettings()
  })

  assert.equal(body.prompt, 'Rendered prompt')
  assert.equal(body.player_id, 'user-1')
  assert.equal(body.player_tier, 'premium')
  assert.equal(body.n_predict, 512)
  assert.equal(body.stream, true)
  assert.equal(body.temperature, 0.9)
})

test('llama completion request body omits structured fields when not requested', () => {
  const body = buildLlamaCompletionRequestBody({
    requestId: 'request-2',
    prompt: 'Rendered prompt',
    userId: 'user-2',
    playerTier: 'basic',
    settings: makeSettings()
  })

  assert.equal('grammar' in body, false)
  assert.equal('json_schema' in body, false)
})

test('llama completion request body includes grammar and json schema only when requested', () => {
  const jsonSchema = {
    type: 'object',
    properties: {
      mood: { type: 'string' }
    }
  }
  const body = buildLlamaCompletionRequestBody({
    requestId: 'request-3',
    prompt: 'Rendered prompt',
    userId: 'user-3',
    playerTier: 'free',
    settings: makeSettings(),
    structuredOutput: {
      grammar: 'root ::= "ok"',
      jsonSchema
    }
  })

  assert.equal(body.grammar, 'root ::= "ok"')
  assert.deepEqual(body.json_schema, jsonSchema)
})

test('llama completion stream treats provider keepalive comments as upstream progress, not provider data', async t => {
  installProviderConfig(t)
  installFetchResponse(
    t,
    providerSseResponse([
      ': keepalive\n\n',
      ': keepalive\n\n',
      'data: {"content":"Hello"}\n\n',
      'data: {"content":" world"}\n\n',
      'data: {"stop":true,"finish_reason":"stop"}\n\n'
    ])
  )

  const emittedTokens: string[] = []
  const result = await streamLlamaCompletion({
    requestId: 'request-keepalive',
    prompt: 'Rendered prompt',
    userId: 'user-keepalive',
    playerTier: 'premium',
    settings: makeSettings(),
    onToken: token => {
      emittedTokens.push(token)
    }
  })
  const diagnostics = result.diagnostics as Record<string, unknown>

  assert.equal(result.content, 'Hello world')
  assert.deepEqual(emittedTokens, ['Hello', ' world'])
  assert.equal(diagnostics.provider_keepalive_count, 2)
  assert.equal(diagnostics.provider_event_count, 3)
  assert.equal(diagnostics.provider_data_event_count, 3)
  assert.equal(diagnostics.provider_content_chunk_count, 2)
  assert.equal(diagnostics.provider_raw_content_chars, 11)
  assert.equal(typeof diagnostics.provider_first_byte_ms, 'number')
  assert.equal(typeof diagnostics.provider_first_content_ms, 'number')
  assert.ok((diagnostics.provider_first_byte_ms as number) >= 0)
  assert.ok((diagnostics.provider_first_content_ms as number) >= 0)
})

test('llama completion stream keeps provider idle timeout alive with keepalive comments before first content', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  installProviderConfig(t)
  installFetchResponse(
    t,
    delayedProviderSseResponse([
      { delayMs: 29_000, chunk: ': keepalive\n\n' },
      { delayMs: 58_000, chunk: ': keepalive\n\n' },
      {
        delayMs: 87_000,
        chunk: 'data: {"content":"Delayed hello"}\n\ndata: {"stop":true,"finish_reason":"stop"}\n\n'
      }
    ])
  )

  const resultPromise = streamLlamaCompletion({
    requestId: 'request-delayed-keepalive',
    prompt: 'Rendered prompt',
    userId: 'user-delayed-keepalive',
    playerTier: 'premium',
    settings: makeSettings()
  })

  await flushAsyncWork()
  t.mock.timers.tick(29_000)
  await flushAsyncWork()
  t.mock.timers.tick(29_000)
  await flushAsyncWork()
  t.mock.timers.tick(29_000)
  await flushAsyncWork()
  t.mock.timers.tick(1)
  await flushAsyncWork()

  const result = await resultPromise
  const diagnostics = result.diagnostics as Record<string, unknown>

  assert.equal(result.content, 'Delayed hello')
  assert.equal(diagnostics.provider_keepalive_count, 2)
  assert.equal(diagnostics.provider_event_count, 2)
  assert.equal(diagnostics.provider_data_event_count, 2)
  assert.equal(diagnostics.provider_content_chunk_count, 1)
  assert.equal(diagnostics.provider_first_byte_ms, 29_000)
  assert.equal(diagnostics.provider_first_content_ms, 87_000)
})

test('llama completion stream preserves empty-stream failure while reporting provider keepalives', async t => {
  installProviderConfig(t)
  installFetchResponse(
    t,
    providerSseResponse([
      ': keepalive\n\n',
      ': keepalive\n\n',
      'data: {"stop":true,"finish_reason":"stop"}\n\n'
    ])
  )

  await assert.rejects(
    () =>
      streamLlamaCompletion({
        requestId: 'request-empty-keepalive',
        prompt: 'Rendered prompt',
        userId: 'user-empty-keepalive',
        playerTier: 'basic',
        settings: makeSettings()
      }),
    error => {
      assert.ok(error instanceof ChatAiProviderError)
      assert.equal(error.reason, 'ai_provider_empty_stream')
      assert.equal(error.details.provider_keepalive_count, 2)
      assert.equal(error.details.provider_event_count, 1)
      assert.equal(error.details.provider_data_event_count, 1)
      assert.equal(error.details.provider_content_chunk_count, 0)
      assert.equal(error.details.provider_first_content_ms, null)
      assert.equal(typeof error.details.provider_first_byte_ms, 'number')
      return true
    }
  )
})
