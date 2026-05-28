import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID = 'G-TEST'

type GtagCall = {
  command: string
  target: string | Date
  params?: Record<string, string | number | boolean | null | undefined> | string
}

type MockWindow = {
  gtag: (command: string, target: string | Date, params?: GtagCall['params'], callback?: (value: string | number | undefined) => void) => void
  location: URL
  sessionStorage: Storage
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
  addEventListener: () => void
}

const loadGoogleAnalyticsEventsModule = async () => import('./google-analytics-events')

const createMemoryStorage = () => {
  const storage = new Map<string, string>()

  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
    clear: () => {
      storage.clear()
    },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size
    }
  } satisfies Storage
}

const createThrowingStorage = () => {
  return {
    getItem: () => {
      throw new DOMException('Storage blocked by browser policy.', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('Storage blocked by browser policy.', 'SecurityError')
    },
    removeItem: () => {
      throw new DOMException('Storage blocked by browser policy.', 'SecurityError')
    },
    clear: () => {
      throw new DOMException('Storage blocked by browser policy.', 'SecurityError')
    },
    key: () => {
      throw new DOMException('Storage blocked by browser policy.', 'SecurityError')
    },
    get length(): number {
      throw new DOMException('Storage blocked by browser policy.', 'SecurityError')
    }
  } satisfies Storage
}

const installMockWindow = (url: string, calls: GtagCall[]) => {
  const mockWindow = {
    gtag: (command: string, target: string | Date, params?: GtagCall['params'], callback?: (value: string | number | undefined) => void) => {
      if (command === 'get' && params === 'client_id') {
        callback?.('1234567890.9876543210')
        return
      }
      if (command === 'get' && params === 'session_id') {
        callback?.('1779186012')
        return
      }
      calls.push({ command, target, params })
    },
    location: new URL(url),
    sessionStorage: createMemoryStorage(),
    setTimeout,
    clearTimeout,
    addEventListener: () => undefined
  } as MockWindow

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: mockWindow
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      title: 'SecretWaifu.com'
    }
  })

  return mockWindow
}

const installStorageBlockedMockWindow = (url: string, calls: GtagCall[]) => {
  const mockWindow = installMockWindow(url, calls)
  mockWindow.sessionStorage = createThrowingStorage()
  return mockWindow
}

test.afterEach(() => {
  // Keep test globals tidy between runs.
  delete (globalThis as { window?: Window }).window
  delete (globalThis as { document?: Document }).document
})

test('trackLandingSignupClickEvent includes landing and campaign attribution from the current URL', async () => {
  const { trackLandingSignupClickEvent } = await loadGoogleAnalyticsEventsModule()
  const calls: GtagCall[] = []
  installMockWindow(
    'https://secretwaifu.com/?sw_landing_page=lp-chat&sw_short_url=itch&utm_source=reddit&utm_medium=cpc&utm_campaign=ahri&utm_content=hero&utm_term=waifu',
    calls
  )

  trackLandingSignupClickEvent()

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], {
    command: 'event',
    target: 'generate_lead',
    params: {
      landing_page: 'lp-chat',
      short_url: 'itch',
      source: 'reddit',
      medium: 'cpc',
      campaign: 'ahri',
      content: 'hero',
      term: 'waifu',
      lead_type: 'signup_click'
    }
  })
  assert.deepEqual(calls[1], {
    command: 'event',
    target: 'landing_signup_click',
    params: {
      landing_page: 'lp-chat',
      short_url: 'itch',
      source: 'reddit',
      medium: 'cpc',
      campaign: 'ahri',
      content: 'hero',
      term: 'waifu'
    }
  })
})

test('stored landing attribution survives later navigation and is attached to sign_up events', async () => {
  const { syncLandingAttributionSnapshot, trackAuthSignUpEvent, trackGoogleAnalyticsPageView } =
    await loadGoogleAnalyticsEventsModule()
  const calls: GtagCall[] = []
  const mockWindow = installMockWindow(
    'https://secretwaifu.com/?sw_landing_page=lp-chat&sw_short_url=itch&utm_source=reddit&utm_medium=cpc&utm_campaign=ahri',
    calls
  )

  trackGoogleAnalyticsPageView('/', new URLSearchParams(mockWindow.location.search))
  syncLandingAttributionSnapshot()

  mockWindow.location = new URL('https://secretwaifu.com/profile')

  trackAuthSignUpEvent('password')

  const signUpCall = calls.at(-1)
  assert.deepEqual(signUpCall, {
    command: 'event',
    target: 'sign_up',
    params: {
      landing_page: 'lp-chat',
      short_url: 'itch',
      source: 'reddit',
      medium: 'cpc',
      campaign: 'ahri',
      method: 'password'
    }
  })
})

test('stored landing attribution is not overwritten by later non-landing campaign parameters', async () => {
  const { trackAuthSignUpEvent, trackGoogleAnalyticsPageView } = await loadGoogleAnalyticsEventsModule()
  const calls: GtagCall[] = []
  const mockWindow = installMockWindow(
    'https://secretwaifu.com/?sw_landing_page=lp-chat&sw_short_url=itch&utm_source=reddit&utm_medium=cpc&utm_campaign=ahri',
    calls
  )

  trackGoogleAnalyticsPageView('/', new URLSearchParams(mockWindow.location.search))
  mockWindow.location = new URL('https://secretwaifu.com/profile?utm_source=discord&utm_campaign=profile')

  trackAuthSignUpEvent('password')

  const signUpCall = calls.at(-1)
  assert.deepEqual(signUpCall, {
    command: 'event',
    target: 'sign_up',
    params: {
      landing_page: 'lp-chat',
      short_url: 'itch',
      source: 'reddit',
      medium: 'cpc',
      campaign: 'ahri',
      method: 'password'
    }
  })
})

test('campaign attribution without a landing marker persists as first touch for later conversion events', async () => {
  const { trackAuthSignUpEvent, trackGoogleAnalyticsPageView } = await loadGoogleAnalyticsEventsModule()
  const calls: GtagCall[] = []
  const mockWindow = installMockWindow(
    'https://secretwaifu.com/?utm_source=reddit&utm_medium=cpc&utm_campaign=ahri',
    calls
  )

  trackGoogleAnalyticsPageView('/', new URLSearchParams(mockWindow.location.search))
  mockWindow.location = new URL('https://secretwaifu.com/profile')

  trackAuthSignUpEvent('password')

  const signUpCall = calls.at(-1)
  assert.deepEqual(signUpCall, {
    command: 'event',
    target: 'sign_up',
    params: {
      source: 'reddit',
      medium: 'cpc',
      campaign: 'ahri',
      method: 'password'
    }
  })
})

test('trackGoogleAnalyticsPageView sends documented manual page_view with sanitized page location', async () => {
  const { trackGoogleAnalyticsPageView } = await loadGoogleAnalyticsEventsModule()
  const calls: GtagCall[] = []
  installMockWindow(
    'https://secretwaifu.com/?utm_source=reddit&utm_medium=cpc&utm_campaign=ahri&token=secret',
    calls
  )

  trackGoogleAnalyticsPageView(
    '/',
    new URLSearchParams('utm_source=reddit&utm_medium=cpc&utm_campaign=ahri&token=secret')
  )

  assert.deepEqual(calls.at(-1), {
    command: 'event',
    target: 'page_view',
    params: {
      page_location: 'https://secretwaifu.com/?utm_source=reddit&utm_medium=cpc&utm_campaign=ahri',
      page_title: 'SecretWaifu.com'
    }
  })
})

test('readGoogleAnalyticsClientContext reads browser identifiers for Measurement Protocol stitching', async () => {
  const { readGoogleAnalyticsClientContext } = await loadGoogleAnalyticsEventsModule()
  const calls: GtagCall[] = []
  installMockWindow('https://secretwaifu.com/?utm_source=reddit', calls)

  assert.deepEqual(await readGoogleAnalyticsClientContext(), {
    clientId: '1234567890.9876543210',
    sessionId: '1779186012'
  })
  assert.equal(calls.length, 0)
})

test('analytics events still send without throwing when sessionStorage is blocked', async () => {
  const { trackAuthLoginEvent } = await loadGoogleAnalyticsEventsModule()
  const calls: GtagCall[] = []
  installStorageBlockedMockWindow('https://secretwaifu.com/profile', calls)

  assert.doesNotThrow(() => trackAuthLoginEvent('password'))
  assert.deepEqual(calls, [
    {
      command: 'event',
      target: 'login',
      params: {
        method: 'password'
      }
    }
  ])
})
