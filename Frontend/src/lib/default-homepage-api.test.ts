import assert from 'node:assert/strict'
import test from 'node:test'

import { updateDefaultHomepage } from './landing-page-api'

const originalFetch = globalThis.fetch
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

type FetchCall = {
  url: string
  init: RequestInit
}

const createDefaultHomepageResponse = (landingPageId: string | null) => {
  return new Response(
    JSON.stringify({
      data: {
        landingPage: landingPageId
          ? {
              id: landingPageId,
              key: 'home1',
              name: 'Homepage Variant 1',
              basePath: '/',
              isActive: true
            }
          : null,
        fallbackKey: 'home2',
        fallbackPath: '/home2'
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

    const parsedBody = requestInit.body ? JSON.parse(String(requestInit.body)) as { landingPageId: string | null } : null
    return createDefaultHomepageResponse(parsedBody?.landingPageId ?? null)
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

test('updateDefaultHomepage sends null when the admin resets to the fallback homepage', async () => {
  const calls: FetchCall[] = []
  installFetchRecorder(calls)

  await updateDefaultHomepage(null)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://secretwaifu.test/api/admin/landing-pages/default-homepage')
  assert.equal(calls[0].init.method, 'PATCH')
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    landingPageId: null
  })
})

test('updateDefaultHomepage trims concrete landing-page ids before sending the request body', async () => {
  const calls: FetchCall[] = []
  installFetchRecorder(calls)

  await updateDefaultHomepage(' landing-1 ')

  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    landingPageId: 'landing-1'
  })
})
