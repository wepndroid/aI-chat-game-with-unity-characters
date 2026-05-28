type GoogleAnalyticsEventParams = Record<string, string | number | boolean | null | undefined>

type GtagCommand = 'config' | 'event' | 'get' | 'js'

type LandingAttributionSnapshot = {
  landing_page?: string
  short_url?: string
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

declare global {
  interface Window {
    gtag?: (
      command: GtagCommand,
      target: string | Date,
      params?: GoogleAnalyticsEventParams | string,
      callback?: (value: string | number | undefined) => void
    ) => void
  }
}

const googleAnalyticsId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID?.trim() ?? ''
const googleAnalyticsReadyEvent = 'secretwaifu-google-analytics-ready'
const landingAttributionStorageKey = 'secretwaifu-ga4-landing-attribution'
const googleAnalyticsContextTimeoutMs = 700

const allowedPageViewQueryKeys = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'openSignIn',
  'openSignUp',
  'source',
  'sw_landing_handoff',
  'sw_landing_page',
  'sw_short_url',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term'
])

const normalizeEventParams = (params: GoogleAnalyticsEventParams = {}) => {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== null && value !== undefined && value !== '')
  ) as GoogleAnalyticsEventParams
}

const normalizeGoogleAnalyticsIdentifier = (value: unknown) => {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 && /^[a-zA-Z0-9._:-]{1,128}$/.test(normalized) ? normalized : null
}

const hasAttributionValues = (snapshot: LandingAttributionSnapshot) => Object.keys(snapshot).length > 0

const hasLandingMarker = (snapshot: LandingAttributionSnapshot) => Boolean(snapshot.landing_page || snapshot.short_url)

const getSessionStorage = () => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const removeStoredAttribution = () => {
  const storage = getSessionStorage()

  if (!storage) {
    return
  }

  try {
    storage.removeItem(landingAttributionStorageKey)
  } catch {
    // Browser privacy/storage policies must never block product flows.
  }
}

const writeStoredAttribution = (snapshot: LandingAttributionSnapshot) => {
  const storage = getSessionStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(landingAttributionStorageKey, JSON.stringify(snapshot))
  } catch {
    // Attribution persistence is best-effort; the event can still be sent.
  }
}

const isAttributionObject = (value: unknown): value is LandingAttributionSnapshot => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const readAttributionFromLocation = (): LandingAttributionSnapshot => {
  if (typeof window === 'undefined') {
    return {}
  }

  const searchParams = new URLSearchParams(window.location.search)

  return normalizeEventParams({
    landing_page: searchParams.get('sw_landing_page'),
    short_url: searchParams.get('sw_short_url'),
    source: searchParams.get('utm_source') ?? searchParams.get('source'),
    medium: searchParams.get('utm_medium'),
    campaign: searchParams.get('utm_campaign'),
    content: searchParams.get('utm_content'),
    term: searchParams.get('utm_term')
  }) as LandingAttributionSnapshot
}

const readStoredAttribution = (): LandingAttributionSnapshot => {
  const storage = getSessionStorage()

  if (!storage) {
    return {}
  }

  let rawValue: string | null = null

  try {
    rawValue = storage.getItem(landingAttributionStorageKey)
  } catch {
    return {}
  }

  if (!rawValue) {
    return {}
  }

  try {
    const parsedValue = JSON.parse(rawValue)

    if (!isAttributionObject(parsedValue)) {
      removeStoredAttribution()
      return {}
    }

    return normalizeEventParams(parsedValue) as LandingAttributionSnapshot
  } catch {
    removeStoredAttribution()
    return {}
  }
}

/**
 * Keeps landing attribution stable for downstream GA events.
 *
 * URLs that carry a landing marker start a new first-touch snapshot for this
 * tab. If no snapshot exists yet, the current campaign parameters become the
 * first touch as well. Later non-landing pages may have unrelated campaign
 * parameters, so they cannot mutate an existing snapshot.
 */
const syncLandingAttributionSnapshot = () => {
  if (typeof window === 'undefined') {
    return {}
  }

  const storedSnapshot = readStoredAttribution()
  const locationSnapshot = readAttributionFromLocation()

  if (hasLandingMarker(locationSnapshot)) {
    writeStoredAttribution(locationSnapshot)
    return locationSnapshot
  }

  if (hasAttributionValues(storedSnapshot)) {
    return storedSnapshot
  }

  if (hasAttributionValues(locationSnapshot)) {
    writeStoredAttribution(locationSnapshot)
  }

  return locationSnapshot
}

const sendGoogleAnalyticsEvent = (eventName: string, params?: GoogleAnalyticsEventParams) => {
  if (typeof window === 'undefined' || !googleAnalyticsId || !window.gtag) {
    return
  }

  window.gtag(
    'event',
    eventName,
    normalizeEventParams({
      ...syncLandingAttributionSnapshot(),
      ...params
    })
  )
}

const buildSafePagePath = (pathname: string, searchParams: { toString: () => string }) => {
  const sourceParams = new URLSearchParams(searchParams.toString())
  const safeParams = new URLSearchParams()

  for (const [key, value] of sourceParams.entries()) {
    if (allowedPageViewQueryKeys.has(key) || key.startsWith('utm_')) {
      safeParams.append(key, value)
    }
  }

  const renderedQuery = safeParams.toString()
  return renderedQuery ? `${pathname}?${renderedQuery}` : pathname
}

const buildSafePageLocation = (pathname: string, searchParams: { toString: () => string }) => {
  if (typeof window === 'undefined') {
    return buildSafePagePath(pathname, searchParams)
  }

  const pagePath = buildSafePagePath(pathname, searchParams)
  const location = new URL(pagePath, window.location.origin)
  return location.href
}

const trackGoogleAnalyticsPageView = (pathname: string, searchParams: { toString: () => string }) => {
  if (typeof window === 'undefined' || !googleAnalyticsId || !window.gtag) {
    return
  }

  syncLandingAttributionSnapshot()
  window.gtag('event', 'page_view', {
    page_location: buildSafePageLocation(pathname, searchParams),
    page_title: document.title
  })
}

const getGoogleAnalyticsField = (fieldName: 'client_id' | 'session_id') => {
  if (typeof window === 'undefined' || !googleAnalyticsId || !window.gtag) {
    return Promise.resolve(null)
  }

  return new Promise<string | null>((resolve) => {
    let b_resolved = false
    const timeoutId = window.setTimeout(() => {
      if (!b_resolved) {
        b_resolved = true
        resolve(null)
      }
    }, googleAnalyticsContextTimeoutMs)

    window.gtag?.('get', googleAnalyticsId, fieldName, (value) => {
      if (b_resolved) {
        return
      }

      b_resolved = true
      window.clearTimeout(timeoutId)
      resolve(normalizeGoogleAnalyticsIdentifier(value))
    })
  })
}

const waitForGoogleAnalyticsReady = () => {
  if (typeof window === 'undefined' || !googleAnalyticsId) {
    return Promise.resolve()
  }

  if (window.gtag) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(resolve, googleAnalyticsContextTimeoutMs)
    window.addEventListener(
      googleAnalyticsReadyEvent,
      () => {
        window.clearTimeout(timeoutId)
        resolve()
      },
      {
        once: true
      }
    )
  })
}

const readGoogleAnalyticsClientContext = async () => {
  await waitForGoogleAnalyticsReady()

  const [clientId, sessionId] = await Promise.all([
    getGoogleAnalyticsField('client_id'),
    getGoogleAnalyticsField('session_id')
  ])

  return {
    clientId,
    sessionId
  }
}

const trackLandingPageVisitEvent = (input: {
  landingPageKey: string
  variantKey?: string | null
  shortUrlKey?: string | null
  routePath: string
  source?: string | null
  medium?: string | null
  campaign?: string | null
  content?: string | null
  term?: string | null
  tracked: boolean
}) => {
  sendGoogleAnalyticsEvent('landing_page_visit', {
    landing_page: input.landingPageKey,
    landing_variant: input.variantKey,
    short_url: input.shortUrlKey,
    route_path: input.routePath,
    source: input.source,
    medium: input.medium,
    campaign: input.campaign,
    content: input.content,
    term: input.term,
    tracked: input.tracked
  })
}

const trackLandingSignupClickEvent = () => {
  sendGoogleAnalyticsEvent('generate_lead', {
    lead_type: 'signup_click'
  })
  sendGoogleAnalyticsEvent('landing_signup_click')
}

const trackAuthSignUpEvent = (method: 'password' | 'google') => {
  sendGoogleAnalyticsEvent('sign_up', {
    method
  })
}

const trackAuthLoginEvent = (method: 'password' | 'google') => {
  sendGoogleAnalyticsEvent('login', {
    method
  })
}

const trackGoogleOAuthStartEvent = (intent: 'signin' | 'signup') => {
  sendGoogleAnalyticsEvent('oauth_start', {
    provider: 'google',
    intent
  })
}

const trackPatreonConnectStartEvent = () => {
  sendGoogleAnalyticsEvent('begin_checkout', {
    checkout_type: 'patreon_connect',
    currency: 'USD'
  })
  sendGoogleAnalyticsEvent('patreon_connect_start')
}

const trackPatreonSyncEvent = (status: 'success' | 'failed') => {
  sendGoogleAnalyticsEvent('patreon_sync', {
    status
  })
}

const trackPatreonDisconnectEvent = (status: 'success' | 'failed') => {
  sendGoogleAnalyticsEvent('patreon_disconnect', {
    status
  })
}

export {
  readAttributionFromLocation,
  readGoogleAnalyticsClientContext,
  readStoredAttribution,
  syncLandingAttributionSnapshot,
  googleAnalyticsReadyEvent,
  trackAuthLoginEvent,
  trackAuthSignUpEvent,
  trackGoogleAnalyticsPageView,
  trackGoogleOAuthStartEvent,
  trackLandingPageVisitEvent,
  trackLandingSignupClickEvent,
  trackPatreonConnectStartEvent,
  trackPatreonDisconnectEvent,
  trackPatreonSyncEvent
}
