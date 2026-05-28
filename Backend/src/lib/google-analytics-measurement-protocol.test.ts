import assert from 'node:assert/strict'
import test from 'node:test'
import { RevenueEventKind, RevenueEventProvider } from '@prisma/client'

import {
  buildGoogleAnalyticsPurchasePayload,
  getGoogleAnalyticsMeasurementConfig,
  sendGoogleAnalyticsPurchaseEvent,
  type GoogleAnalyticsPurchaseEventInput
} from './google-analytics-measurement-protocol'

const ORIGINAL_ENV = { ...process.env }
const NOW = new Date('2026-05-19T12:00:00.000Z')

const withGoogleAnalyticsEnv = (env: Record<string, string | undefined>) => {
  process.env = {
    ...ORIGINAL_ENV,
    ...env
  }
}

const purchaseInput = (overrides?: Partial<GoogleAnalyticsPurchaseEventInput['revenueEvent']>): GoogleAnalyticsPurchaseEventInput => ({
  now: NOW,
  revenueEvent: {
    id: 'revenue-event-1',
    userId: 'user-secret-internal-id',
    provider: RevenueEventProvider.PATREON,
    kind: RevenueEventKind.INITIAL_PURCHASE,
    tierCode: 'secretwaifu-access',
    amountCents: 999,
    billingPeriodMonths: 1,
    chargedAt: new Date('2026-05-19T11:59:00.000Z'),
    ...overrides
  },
  attribution: {
    landingPageKey: 'home2',
    variantKey: 'mita-hero',
    routePath: '/home2',
    shortUrlKey: 'paid-social-mita',
    source: 'twitter',
    medium: 'paid-social',
    campaign: 'mita-launch',
    content: 'hero-video',
    term: null,
    gaClientId: '1234567890.9876543210',
    gaSessionId: '1779186012'
  }
})

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

test('getGoogleAnalyticsMeasurementConfig requires the backend Measurement Protocol secret', () => {
  withGoogleAnalyticsEnv({
    GOOGLE_ANALYTICS_MEASUREMENT_ID: 'G-TEST',
    GOOGLE_ANALYTICS_API_SECRET: ''
  })

  assert.equal(getGoogleAnalyticsMeasurementConfig(), null)
})

test('buildGoogleAnalyticsPurchasePayload creates a GA4 purchase event without PII or provider event ids', () => {
  const payload = buildGoogleAnalyticsPurchasePayload(purchaseInput(), {
    measurementId: 'G-TEST',
    apiSecret: 'super-secret',
    currency: 'USD',
    endpoint: 'https://www.google-analytics.com/mp/collect'
  })
  const serializedPayload = JSON.stringify(payload)
  const event = payload.events[0] as {
    name: string
    params: Record<string, unknown>
  }

  assert.equal(event.name, 'purchase')
  assert.equal(payload.timestamp_micros, new Date('2026-05-19T11:59:00.000Z').getTime() * 1000)
  assert.equal(Object.hasOwn(event, 'timestamp_micros'), false)
  assert.equal(event.params.transaction_id, 'revenue-event-1')
  assert.equal(event.params.currency, 'USD')
  assert.equal(event.params.value, 9.99)
  assert.equal(event.params.utm_source, 'twitter')
  assert.equal(event.params.short_url_key, 'paid-social-mita')
  assert.equal(event.params.session_id, '1779186012')
  assert.equal(event.params.engagement_time_msec, 100)
  assert.equal(serializedPayload.includes('user-secret-internal-id'), false)
  assert.equal(serializedPayload.includes('super-secret'), false)
  assert.equal(serializedPayload.includes('patreon:'), false)
  assert.equal(payload.client_id, '1234567890.9876543210')
  assert.match(String(payload.user_id), /^sw_[a-f0-9]{32}$/)
})

test('buildGoogleAnalyticsPurchasePayload omits unsupported backdated timestamps', () => {
  const payload = buildGoogleAnalyticsPurchasePayload(
    purchaseInput({
      chargedAt: new Date('2026-05-01T12:00:00.000Z')
    }),
    {
      measurementId: 'G-TEST',
      apiSecret: 'super-secret',
      currency: 'USD',
      endpoint: 'https://www.google-analytics.com/mp/collect'
    }
  )
  const event = payload.events[0] as {
    timestamp_micros?: number
  }

  assert.equal(payload.timestamp_micros, undefined)
  assert.equal(event.timestamp_micros, undefined)
})

test('buildGoogleAnalyticsPurchasePayload drops risky public campaign values before sending to GA', () => {
  const input = purchaseInput()
  input.attribution = {
    ...(input.attribution ?? {
      landingPageKey: null,
      variantKey: null,
      routePath: null,
      shortUrlKey: null,
      source: null,
      medium: null,
      campaign: null,
      content: null,
      term: null,
      gaClientId: '1234567890.9876543210',
      gaSessionId: '1779186012'
    }),
    source: 'creator@example.com',
    medium: 'paid-social',
    campaign: 'token=secret',
    content: '+32 477 12 34 56'
  }
  const payload = buildGoogleAnalyticsPurchasePayload(input, {
    measurementId: 'G-TEST',
    apiSecret: 'super-secret',
    currency: 'USD',
    endpoint: 'https://www.google-analytics.com/mp/collect'
  })
  const event = payload.events[0] as {
    params: Record<string, unknown>
  }

  assert.equal(event.params.utm_source, undefined)
  assert.equal(event.params.utm_medium, 'paid-social')
  assert.equal(event.params.utm_campaign, undefined)
  assert.equal(event.params.utm_content, undefined)
})

test('sendGoogleAnalyticsPurchaseEvent posts to Measurement Protocol from backend config', async () => {
  withGoogleAnalyticsEnv({
    GOOGLE_ANALYTICS_MEASUREMENT_ID: 'G-TEST',
    GOOGLE_ANALYTICS_API_SECRET: 'api-secret',
    GOOGLE_ANALYTICS_REVENUE_CURRENCY: 'EUR'
  })

  const calls: Array<{ url: URL; init: RequestInit }> = []
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({
      url: url as URL,
      init: init ?? {}
    })

    return new Response(null, {
      status: 204
    })
  }

  const result = await sendGoogleAnalyticsPurchaseEvent(purchaseInput(), {
    fetchImpl
  })

  assert.deepEqual(result, { sent: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url.origin, 'https://www.google-analytics.com')
  assert.equal(calls[0].url.pathname, '/mp/collect')
  assert.equal(calls[0].url.searchParams.get('measurement_id'), 'G-TEST')
  assert.equal(calls[0].url.searchParams.get('api_secret'), 'api-secret')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], 'application/json')
  const payload = JSON.parse(String(calls[0].init.body)) as { events: Array<{ params: Record<string, unknown> }> }
  assert.equal(payload.events[0].params.currency, 'EUR')
})

test('sendGoogleAnalyticsPurchaseEvent can use the EU Measurement Protocol collection host', async () => {
  withGoogleAnalyticsEnv({
    GOOGLE_ANALYTICS_MEASUREMENT_ID: 'G-TEST',
    GOOGLE_ANALYTICS_API_SECRET: 'api-secret',
    GOOGLE_ANALYTICS_COLLECTION_REGION: 'eu'
  })

  const calls: URL[] = []
  const fetchImpl: typeof fetch = async (url) => {
    calls.push(url as URL)

    return new Response(null, {
      status: 204
    })
  }

  await sendGoogleAnalyticsPurchaseEvent(purchaseInput(), {
    fetchImpl
  })

  assert.equal(calls[0].origin, 'https://region1.google-analytics.com')
})

test('sendGoogleAnalyticsPurchaseEvent is disabled when Measurement Protocol is not configured', async () => {
  withGoogleAnalyticsEnv({
    GOOGLE_ANALYTICS_MEASUREMENT_ID: '',
    GOOGLE_ANALYTICS_API_SECRET: ''
  })
  let fetchCalled = false

  const result = await sendGoogleAnalyticsPurchaseEvent(purchaseInput(), {
    fetchImpl: async () => {
      fetchCalled = true
      return new Response(null, {
        status: 204
      })
    }
  })

  assert.deepEqual(result, {
    sent: false,
    reason: 'not_configured'
  })
  assert.equal(fetchCalled, false)
})

test('sendGoogleAnalyticsPurchaseEvent skips synthetic purchases without a browser client id', async () => {
  withGoogleAnalyticsEnv({
    GOOGLE_ANALYTICS_MEASUREMENT_ID: 'G-TEST',
    GOOGLE_ANALYTICS_API_SECRET: 'api-secret'
  })
  let fetchCalled = false
  const input = purchaseInput()
  input.attribution = {
    ...(input.attribution ?? {
      landingPageKey: null,
      variantKey: null,
      routePath: null,
      shortUrlKey: null,
      source: null,
      medium: null,
      campaign: null,
      content: null,
      term: null,
      gaClientId: null,
      gaSessionId: null
    }),
    gaClientId: null
  }

  const result = await sendGoogleAnalyticsPurchaseEvent(input, {
    fetchImpl: async () => {
      fetchCalled = true
      return new Response(null, {
        status: 204
      })
    }
  })

  assert.deepEqual(result, {
    sent: false,
    reason: 'missing_client_id'
  })
  assert.equal(fetchCalled, false)
})

test('buildGoogleAnalyticsPurchasePayload refuses payloads that cannot stitch to a browser session', () => {
  const input = purchaseInput()
  input.attribution = {
    ...(input.attribution ?? {
      landingPageKey: null,
      variantKey: null,
      routePath: null,
      shortUrlKey: null,
      source: null,
      medium: null,
      campaign: null,
      content: null,
      term: null,
      gaClientId: null,
      gaSessionId: null
    }),
    gaClientId: null
  }

  assert.throws(
    () =>
      buildGoogleAnalyticsPurchasePayload(input, {
        measurementId: 'G-TEST',
        apiSecret: 'super-secret',
        currency: 'USD',
        endpoint: 'https://www.google-analytics.com/mp/collect'
      }),
    /browser client id/
  )
})
