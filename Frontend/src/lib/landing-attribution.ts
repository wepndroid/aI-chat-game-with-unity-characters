type SearchParamsInput = {
  toString: () => string
}

type LandingPageIdentity = {
  key: string
  name: string
}

type CampaignAttribution = {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  shortUrlKey: string | null
}

const OPEN_SIGN_UP_QUERY_KEY = 'openSignUp'
const OPEN_SIGN_IN_QUERY_KEY = 'openSignIn'
const LANDING_PAGE_QUERY_KEY = 'sw_landing_page'
const LANDING_PAGE_NAME_QUERY_KEY = 'sw_landing_page_name'
const LANDING_SIGNUP_HANDOFF_QUERY_KEY = 'sw_landing_handoff'
const SHORT_URL_QUERY_KEY = 'sw_short_url'
const SOURCE_QUERY_KEY = 'source'

const UTM_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term'
] as const

const AD_CLICK_ID_QUERY_KEYS = [
  'gclid',
  'fbclid',
  'ttclid',
  'msclkid'
] as const

const SIGNUP_HANDOFF_PASSTHROUGH_QUERY_KEYS = [
  SOURCE_QUERY_KEY,
  SHORT_URL_QUERY_KEY,
  ...UTM_QUERY_KEYS,
  ...AD_CLICK_ID_QUERY_KEYS
] as const

const TRACKED_ROUTE_QUERY_KEYS_TO_STRIP = new Set<string>([
  OPEN_SIGN_UP_QUERY_KEY,
  OPEN_SIGN_IN_QUERY_KEY,
  LANDING_PAGE_QUERY_KEY,
  LANDING_PAGE_NAME_QUERY_KEY,
  LANDING_SIGNUP_HANDOFF_QUERY_KEY,
  SHORT_URL_QUERY_KEY,
  SOURCE_QUERY_KEY,
  'oauth',
  'oauth_error',
  'message',
  'provider',
  ...UTM_QUERY_KEYS,
  ...AD_CLICK_ID_QUERY_KEYS
])

const toUrlSearchParams = (searchParams: SearchParamsInput) => new URLSearchParams(searchParams.toString())

const splitTargetPath = (targetPath: string) => {
  const queryStartIndex = targetPath.indexOf('?')

  if (queryStartIndex === -1) {
    return {
      pathname: targetPath,
      searchParams: new URLSearchParams()
    }
  }

  return {
    pathname: targetPath.slice(0, queryStartIndex) || '/',
    searchParams: new URLSearchParams(targetPath.slice(queryStartIndex + 1))
  }
}

/**
 * Builds the homepage signup handoff URL for landing pages.
 *
 * The `sw_landing_handoff=1` marker means the homepage should open signup without
 * recording a replacement homepage visit, preserving the original landing visit
 * as the conversion source. Only marketing attribution keys are copied so token-
 * like or otherwise sensitive query parameters are not propagated across pages.
 */
const buildLandingSignupHref = (
  searchParams: SearchParamsInput,
  landingPage: LandingPageIdentity,
  targetPath = '/'
) => {
  const sourceParams = toUrlSearchParams(searchParams)
  const target = splitTargetPath(targetPath)

  for (const key of SIGNUP_HANDOFF_PASSTHROUGH_QUERY_KEYS) {
    for (const value of sourceParams.getAll(key)) {
      target.searchParams.append(key, value)
    }
  }

  target.searchParams.set(OPEN_SIGN_UP_QUERY_KEY, '1')
  target.searchParams.set(LANDING_PAGE_QUERY_KEY, landingPage.key)
  target.searchParams.set(LANDING_PAGE_NAME_QUERY_KEY, landingPage.name)
  target.searchParams.set(LANDING_SIGNUP_HANDOFF_QUERY_KEY, '1')

  const renderedQuery = target.searchParams.toString()
  return renderedQuery ? `${target.pathname}?${renderedQuery}` : target.pathname
}

const readCampaignAttribution = (searchParams: SearchParamsInput): CampaignAttribution => {
  const params = toUrlSearchParams(searchParams)

  return {
    source: params.get('utm_source') ?? params.get(SOURCE_QUERY_KEY),
    medium: params.get('utm_medium'),
    campaign: params.get('utm_campaign'),
    content: params.get('utm_content'),
    term: params.get('utm_term'),
    shortUrlKey: params.get(SHORT_URL_QUERY_KEY)
  }
}

const buildTrackedRoutePath = (pathname: string, searchParams: SearchParamsInput) => {
  const routeQuery = toUrlSearchParams(searchParams)

  for (const key of Array.from(routeQuery.keys())) {
    if (
      TRACKED_ROUTE_QUERY_KEYS_TO_STRIP.has(key) ||
      key.startsWith('sw_') ||
      key.startsWith('utm_')
    ) {
      routeQuery.delete(key)
    }
  }

  const renderedQuery = routeQuery.toString()
  return renderedQuery ? `${pathname}?${renderedQuery}` : pathname
}

const isLandingSignupHandoff = (searchParams: SearchParamsInput) => {
  const params = toUrlSearchParams(searchParams)
  const landingPageKey = params.get(LANDING_PAGE_QUERY_KEY)?.trim()

  return (
    params.get(OPEN_SIGN_UP_QUERY_KEY) === '1' &&
    params.get(LANDING_SIGNUP_HANDOFF_QUERY_KEY) === '1' &&
    Boolean(landingPageKey)
  )
}

export {
  AD_CLICK_ID_QUERY_KEYS,
  LANDING_PAGE_NAME_QUERY_KEY,
  LANDING_PAGE_QUERY_KEY,
  LANDING_SIGNUP_HANDOFF_QUERY_KEY,
  OPEN_SIGN_UP_QUERY_KEY,
  SHORT_URL_QUERY_KEY,
  UTM_QUERY_KEYS,
  buildLandingSignupHref,
  buildTrackedRoutePath,
  isLandingSignupHandoff,
  readCampaignAttribution
}
export type {
  CampaignAttribution,
  LandingPageIdentity,
  SearchParamsInput
}
