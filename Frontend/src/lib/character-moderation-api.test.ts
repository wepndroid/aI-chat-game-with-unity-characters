import assert from 'node:assert/strict'
import test from 'node:test'

import { moderateCharacterStatus } from './character-api'

const originalFetch = globalThis.fetch
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

type FetchCall = {
  url: string
  init: RequestInit
}

const createModerationResponse = (status: 'APPROVED' | 'REJECTED') => {
  return new Response(
    JSON.stringify({
      data: {
        id: 'character-1',
        name: 'Community Character',
        status,
        visibility: 'PUBLIC',
        publishedAt: status === 'APPROVED' ? '2026-05-21T10:00:00.000Z' : null,
        updatedAt: '2026-05-21T10:00:00.000Z',
        moderationRejectReason: status === 'REJECTED' ? 'Needs a safer preview image.' : null
      }
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )
}

const installFetchRecorder = (calls: FetchCall[]) => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === 'string' ? input : input.toString()
    const requestInit = init ?? {}
    calls.push({ url: requestUrl, init: requestInit })

    const parsedBody = requestInit.body ? JSON.parse(String(requestInit.body)) as { status: 'APPROVED' | 'REJECTED' } : null
    return createModerationResponse(parsedBody?.status ?? 'APPROVED')
  }) as typeof fetch
}

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://secretwaifu.test/api'
})

test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_BASE_URL
  } else {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl
  }
})

test('moderateCharacterStatus approves a character through the explicit moderation endpoint', async () => {
  const calls: FetchCall[] = []
  installFetchRecorder(calls)

  await moderateCharacterStatus(' character-1 ', 'APPROVED')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://secretwaifu.test/api/characters/character-1/status')
  assert.equal(calls[0].init.method, 'PATCH')
  assert.equal(calls[0].init.credentials, 'include')
  assert.deepEqual(calls[0].init.headers, {
    'Content-Type': 'application/json'
  })
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    status: 'APPROVED'
  })
})

test('moderateCharacterStatus includes the moderation rejection reason when rejecting a character', async () => {
  const calls: FetchCall[] = []
  installFetchRecorder(calls)

  await moderateCharacterStatus('character-1', 'REJECTED', 'Needs a safer preview image.')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://secretwaifu.test/api/characters/character-1/status')
  assert.equal(calls[0].init.method, 'PATCH')
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    status: 'REJECTED',
    rejectReason: 'Needs a safer preview image.'
  })
})
