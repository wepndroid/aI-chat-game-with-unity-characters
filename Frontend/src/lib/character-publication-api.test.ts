import assert from 'node:assert/strict'
import test from 'node:test'

import { createCharacter, updateCharacter } from './character-api'

const originalFetch = globalThis.fetch
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

type FetchCall = {
  url: string
  init: RequestInit
}

const createCharacterResponse = (status: 'DRAFT' | 'APPROVED') => {
  return new Response(
    JSON.stringify({
      data: {
        id: 'character-1',
        slug: 'official-character-character-1',
        name: 'Official Character',
        status,
        visibility: 'PUBLIC',
        createdAt: '2026-05-21T10:00:00.000Z',
        updatedAt: '2026-05-21T10:00:00.000Z'
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

    const parsedBody = requestInit.body
      ? JSON.parse(String(requestInit.body)) as { publicationIntent?: 'draft' | 'publish' }
      : {}

    return createCharacterResponse(parsedBody.publicationIntent === 'draft' ? 'DRAFT' : 'APPROVED')
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

test('createCharacter sends explicit draft publication intent on the character create endpoint', async () => {
  const calls: FetchCall[] = []
  installFetchRecorder(calls)

  await createCharacter({
    name: 'Official Character',
    initialStory: {
      title: 'Official Character Introduction',
      promptDescription: 'Official character prompt.',
      personality: 'Kind',
      scenario: 'Official character introduction scene.',
      firstMessage: 'Hello.',
      scenarioStory: 'Official character introduction scene.'
    },
    vroidFileUrl: 'https://secretwaifu.test/uploads/official.vrm',
    previewImageUrl: 'https://secretwaifu.test/uploads/official.png',
    publicationIntent: 'draft',
    visibility: 'PUBLIC'
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://secretwaifu.test/api/characters')
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    name: 'Official Character',
    initialStory: {
      title: 'Official Character Introduction',
      promptDescription: 'Official character prompt.',
      personality: 'Kind',
      scenario: 'Official character introduction scene.',
      firstMessage: 'Hello.',
      scenarioStory: 'Official character introduction scene.'
    },
    vroidFileUrl: 'https://secretwaifu.test/uploads/official.vrm',
    previewImageUrl: 'https://secretwaifu.test/uploads/official.png',
    publicationIntent: 'draft',
    visibility: 'PUBLIC'
  })
})

test('updateCharacter sends explicit publish intent on the content update endpoint', async () => {
  const calls: FetchCall[] = []
  installFetchRecorder(calls)

  await updateCharacter(' official-character-1 ', {
    publicationIntent: 'publish'
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://secretwaifu.test/api/characters/official-character-1')
  assert.equal(calls[0].init.method, 'PATCH')
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    publicationIntent: 'publish'
  })
})
