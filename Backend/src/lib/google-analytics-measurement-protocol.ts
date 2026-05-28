import { createHash } from 'node:crypto'
import type { RevenueEventKind, RevenueEventProvider } from '@prisma/client'
import { redactLogText } from './log-redaction'

const GA4_COLLECT_ENDPOINT = 'https://www.google-analytics.com/mp/collect'
const GA4_EU_COLLECT_ENDPOINT = 'https://region1.google-analytics.com/mp/collect'
const DEFAULT_REVENUE_CURRENCY = 'USD'
const GA4_STANDARD_PARAM_VALUE_LIMIT = 100
const GA4_BACKDATE_LIMIT_MS = 72 * 60 * 60 * 1000
const GA4_REQUEST_TIMEOUT_MS = 3000
const EMAIL_LIKE_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const PHONE_LIKE_PATTERN = /\+?\d[\d\s().-]{7,}\d/
const TOKEN_QUERY_PATTERN = /\b(?:access_token|refresh_token|id_token|stream_token|token|password)=/i

type GoogleAnalyticsRevenueEvent = {
  id: string
  userId: string
  provider: RevenueEventProvider
  kind: RevenueEventKind
  tierCode: string
  amountCents: number
  billingPeriodMonths: number
  chargedAt: Date
}

type GoogleAnalyticsRevenueAttribution = {
  landingPageKey: string | null
  variantKey: string | null
  routePath: string | null
  shortUrlKey: string | null
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  gaClientId: string | null
  gaSessionId: string | null
}

type GoogleAnalyticsPurchaseEventInput = {
  revenueEvent: GoogleAnalyticsRevenueEvent
  attribution?: GoogleAnalyticsRevenueAttribution | null
  now?: Date
}

type GoogleAnalyticsMeasurementConfig = {
  measurementId: string
  apiSecret: string
  currency: string
  endpoint: string
}

type GoogleAnalyticsMeasurementEvent = {
  name: 'purchase'
  params: Record<string, unknown>
}

type GoogleAnalyticsMeasurementPayload = {
  client_id: string
  user_id: string
  timestamp_micros?: number
  events: GoogleAnalyticsMeasurementEvent[]
}

type MeasurementProtocolFetch = typeof fetch

type SendGoogleAnalyticsPurchaseEventOptions = {
  fetchImpl?: MeasurementProtocolFetch
}

const toOptionalTrimmed = (value: string | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

const getGoogleAnalyticsMeasurementConfig = (): GoogleAnalyticsMeasurementConfig | null => {
  const measurementId = toOptionalTrimmed(process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID)
  const apiSecret = toOptionalTrimmed(process.env.GOOGLE_ANALYTICS_API_SECRET)

  if (!measurementId || !apiSecret) {
    return null
  }

  const configuredCurrency = toOptionalTrimmed(process.env.GOOGLE_ANALYTICS_REVENUE_CURRENCY)
  const currency = configuredCurrency && /^[A-Z]{3}$/.test(configuredCurrency) ? configuredCurrency : DEFAULT_REVENUE_CURRENCY

  return {
    measurementId,
    apiSecret,
    currency,
    endpoint: process.env.GOOGLE_ANALYTICS_COLLECTION_REGION?.trim().toLowerCase() === 'eu' ? GA4_EU_COLLECT_ENDPOINT : GA4_COLLECT_ENDPOINT
  }
}

const toPseudonymousUserKey = (userId: string) =>
  createHash('sha256').update(`secretwaifu:ga4:user:${userId}`).digest('hex').slice(0, 32)

const toMoneyValue = (amountCents: number) => Number((Math.max(0, Math.round(amountCents)) / 100).toFixed(2))

const toTimestampMicros = (date: Date) => date.getTime() * 1000

const maybeTimestampMicros = (chargedAt: Date, now: Date) => {
  const ageMs = now.getTime() - chargedAt.getTime()

  if (ageMs < 0 || ageMs > GA4_BACKDATE_LIMIT_MS) {
    return undefined
  }

  return toTimestampMicros(chargedAt)
}

const toGa4StringParam = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? ''

  if (!trimmed) {
    return undefined
  }

  return trimmed.replace(/[\r\n\t]+/g, ' ').slice(0, GA4_STANDARD_PARAM_VALUE_LIMIT)
}

const toGa4Identifier = (value: string | null | undefined) => {
  const normalized = toGa4StringParam(value)
  return normalized && /^[a-zA-Z0-9._:-]{1,128}$/.test(normalized) ? normalized : null
}

const containsPotentialPii = (value: string) =>
  EMAIL_LIKE_PATTERN.test(value) || PHONE_LIKE_PATTERN.test(value) || TOKEN_QUERY_PATTERN.test(value)

const addOptionalParam = (params: Record<string, unknown>, key: string, value: string | null | undefined) => {
  const normalized = toGa4StringParam(value)

  if (normalized && !containsPotentialPii(normalized)) {
    params[key] = normalized
  }
}

const buildGoogleAnalyticsPurchasePayload = (
  input: GoogleAnalyticsPurchaseEventInput,
  config: GoogleAnalyticsMeasurementConfig
): GoogleAnalyticsMeasurementPayload => {
  const now = input.now ?? new Date()
  const revenueEvent = input.revenueEvent
  const attribution = input.attribution ?? null
  const gaClientId = toGa4Identifier(attribution?.gaClientId)
  const gaSessionId = toGa4Identifier(attribution?.gaSessionId)
  const pseudonymousUserKey = toPseudonymousUserKey(revenueEvent.userId)
  const value = toMoneyValue(revenueEvent.amountCents)

  if (!gaClientId) {
    throw new Error('GA4 purchase Measurement Protocol payload requires a browser client id.')
  }

  const params: Record<string, unknown> = {
    currency: config.currency,
    value,
    transaction_id: revenueEvent.id,
    affiliation: 'SecretWaifu Patreon',
    payment_provider: revenueEvent.provider.toLowerCase(),
    revenue_event_kind: revenueEvent.kind.toLowerCase(),
    tier_code: toGa4StringParam(revenueEvent.tierCode) ?? 'unknown',
    billing_period_months: Math.max(1, Math.round(revenueEvent.billingPeriodMonths)),
    items: [
      {
        item_id: `secretwaifu_${(toGa4StringParam(revenueEvent.tierCode) ?? 'unknown').toLowerCase()}`,
        item_name: 'SecretWaifu Access',
        item_category: 'subscription',
        item_variant: toGa4StringParam(revenueEvent.tierCode) ?? 'unknown',
        price: value,
        quantity: 1
      }
    ]
  }

  addOptionalParam(params, 'landing_page_key', attribution?.landingPageKey)
  addOptionalParam(params, 'landing_variant_key', attribution?.variantKey)
  addOptionalParam(params, 'landing_route_path', attribution?.routePath)
  addOptionalParam(params, 'short_url_key', attribution?.shortUrlKey)
  addOptionalParam(params, 'utm_source', attribution?.source)
  addOptionalParam(params, 'utm_medium', attribution?.medium)
  addOptionalParam(params, 'utm_campaign', attribution?.campaign)
  addOptionalParam(params, 'utm_content', attribution?.content)
  addOptionalParam(params, 'utm_term', attribution?.term)

  if (gaSessionId) {
    params.session_id = gaSessionId
    params.engagement_time_msec = 100
  }

  const event: GoogleAnalyticsMeasurementEvent = {
    name: 'purchase',
    params
  }
  const timestampMicros = maybeTimestampMicros(revenueEvent.chargedAt, now)
  const payload: GoogleAnalyticsMeasurementPayload = {
    client_id: gaClientId,
    user_id: `sw_${pseudonymousUserKey}`,
    events: [event]
  }

  if (timestampMicros !== undefined) {
    // This sender posts one purchase per request, so request-level backdating
    // keeps the event payload within GA4's documented Measurement Protocol body.
    payload.timestamp_micros = timestampMicros
  }

  return payload
}

/**
 * Sends a server-side GA4 ecommerce purchase event for a persisted revenue row.
 *
 * The payload deliberately uses pseudonymous internal identifiers and omits
 * emails, names, Patreon account ids, cookies, auth headers, and provider event
 * keys. Revenue persistence and entitlement updates must remain authoritative;
 * Analytics delivery is best-effort and never throws to callers.
 */
const sendGoogleAnalyticsPurchaseEvent = async (
  input: GoogleAnalyticsPurchaseEventInput,
  options?: SendGoogleAnalyticsPurchaseEventOptions
) => {
  const config = getGoogleAnalyticsMeasurementConfig()
  const gaClientId = toGa4Identifier(input.attribution?.gaClientId)

  if (!config) {
    return {
      sent: false,
      reason: 'not_configured' as const
    }
  }

  if (!gaClientId) {
    return {
      sent: false,
      reason: 'missing_client_id' as const
    }
  }

  const fetchImpl = options?.fetchImpl ?? fetch
  const requestUrl = new URL(config.endpoint)
  requestUrl.searchParams.set('measurement_id', config.measurementId)
  requestUrl.searchParams.set('api_secret', config.apiSecret)
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), GA4_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetchImpl(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildGoogleAnalyticsPurchasePayload(input, config)),
      signal: abortController.signal
    })

    if (!response.ok) {
      const responseText = redactLogText((await response.text().catch(() => '')).slice(0, 500))
      console.warn('[analytics] Google Analytics purchase event was rejected.', {
        status: response.status,
        revenueEventId: input.revenueEvent.id,
        response: responseText
      })

      return {
        sent: false,
        reason: 'rejected' as const
      }
    }

    return {
      sent: true as const
    }
  } catch (error) {
    console.warn('[analytics] Google Analytics purchase event failed.', {
      revenueEventId: input.revenueEvent.id,
      error: redactLogText(error instanceof Error ? error.message : String(error))
    })

    return {
      sent: false,
      reason: 'failed' as const
    }
  } finally {
    clearTimeout(timeout)
  }
}

export {
  buildGoogleAnalyticsPurchasePayload,
  getGoogleAnalyticsMeasurementConfig,
  sendGoogleAnalyticsPurchaseEvent
}
export type {
  GoogleAnalyticsMeasurementConfig,
  GoogleAnalyticsMeasurementPayload,
  GoogleAnalyticsPurchaseEventInput,
  GoogleAnalyticsRevenueAttribution,
  GoogleAnalyticsRevenueEvent,
  SendGoogleAnalyticsPurchaseEventOptions
}
