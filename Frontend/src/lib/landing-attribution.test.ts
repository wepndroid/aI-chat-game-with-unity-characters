import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLandingSignupHref,
  buildTrackedRoutePath,
  isLandingSignupHandoff,
  readCampaignAttribution
} from './landing-attribution'

const toSearchParams = (query: string) => new URLSearchParams(query)

test('buildLandingSignupHref marks lp-chat signup handoffs and preserves allowed campaign fields', () => {
  const href = buildLandingSignupHref(
    toSearchParams(
      'utm_source=reddit&utm_medium=cpc&utm_campaign=ahri&utm_content=hero&utm_term=waifu&source=legacy&sw_short_url=itch&token=secret'
    ),
    {
      key: 'lp-chat',
      name: 'Ahri Chat Preview Landing Page'
    }
  )
  const url = new URL(`https://secretwaifu.com${href}`)

  assert.equal(url.pathname, '/')
  assert.equal(url.searchParams.get('openSignUp'), '1')
  assert.equal(url.searchParams.get('sw_landing_page'), 'lp-chat')
  assert.equal(url.searchParams.get('sw_landing_page_name'), 'Ahri Chat Preview Landing Page')
  assert.equal(url.searchParams.get('sw_landing_handoff'), '1')
  assert.equal(url.searchParams.get('utm_source'), 'reddit')
  assert.equal(url.searchParams.get('utm_medium'), 'cpc')
  assert.equal(url.searchParams.get('utm_campaign'), 'ahri')
  assert.equal(url.searchParams.get('utm_content'), 'hero')
  assert.equal(url.searchParams.get('utm_term'), 'waifu')
  assert.equal(url.searchParams.get('source'), 'legacy')
  assert.equal(url.searchParams.get('sw_short_url'), 'itch')
  assert.equal(url.searchParams.get('token'), null)
})

test('buildLandingSignupHref marks lp-1 signup handoffs with its landing identity', () => {
  const href = buildLandingSignupHref(toSearchParams('utm_source=short-url'), {
    key: 'lp-1',
    name: 'Landing Page 1'
  })
  const url = new URL(`https://secretwaifu.com${href}`)

  assert.equal(url.searchParams.get('openSignUp'), '1')
  assert.equal(url.searchParams.get('sw_landing_page'), 'lp-1')
  assert.equal(url.searchParams.get('sw_landing_page_name'), 'Landing Page 1')
  assert.equal(url.searchParams.get('sw_landing_handoff'), '1')
  assert.equal(url.searchParams.get('utm_source'), 'short-url')
})

test('buildLandingSignupHref preserves common ad click IDs and drops unsafe or unknown parameters', () => {
  const href = buildLandingSignupHref(
    toSearchParams(
      'gclid=google-1&fbclid=meta-1&ttclid=tiktok-1&msclkid=microsoft-1&token=secret&session=session-1&password=pw&authorization=bearer&unknown=value'
    ),
    {
      key: 'lp-chat',
      name: 'Ahri Chat Preview Landing Page'
    }
  )
  const url = new URL(`https://secretwaifu.com${href}`)

  assert.equal(url.searchParams.get('gclid'), 'google-1')
  assert.equal(url.searchParams.get('fbclid'), 'meta-1')
  assert.equal(url.searchParams.get('ttclid'), 'tiktok-1')
  assert.equal(url.searchParams.get('msclkid'), 'microsoft-1')
  assert.equal(url.searchParams.get('token'), null)
  assert.equal(url.searchParams.get('session'), null)
  assert.equal(url.searchParams.get('password'), null)
  assert.equal(url.searchParams.get('authorization'), null)
  assert.equal(url.searchParams.get('unknown'), null)
})

test('readCampaignAttribution maps campaign fields and prefers utm_source over source fallback', () => {
  assert.deepEqual(
    readCampaignAttribution(
      toSearchParams(
        'utm_source=reddit&source=legacy&utm_medium=cpc&utm_campaign=ahri&utm_content=hero&utm_term=waifu&sw_short_url=itch'
      )
    ),
    {
      source: 'reddit',
      medium: 'cpc',
      campaign: 'ahri',
      content: 'hero',
      term: 'waifu',
      shortUrlKey: 'itch'
    }
  )
})

test('isLandingSignupHandoff only accepts complete signup handoff markers', () => {
  assert.equal(isLandingSignupHandoff(toSearchParams('openSignUp=1&sw_landing_handoff=1&sw_landing_page=lp-chat')), true)
  assert.equal(isLandingSignupHandoff(toSearchParams('sw_landing_handoff=1&sw_landing_page=lp-chat')), false)
  assert.equal(isLandingSignupHandoff(toSearchParams('openSignUp=1&sw_landing_page=lp-chat')), false)
  assert.equal(isLandingSignupHandoff(toSearchParams('openSignUp=1&sw_landing_handoff=1')), false)
})

test('buildTrackedRoutePath strips attribution, modal, oauth, and ad click query keys', () => {
  const routePath = buildTrackedRoutePath(
    '/',
    toSearchParams(
      'utm_source=reddit&source=legacy&sw_short_url=itch&sw_landing_page=lp-chat&sw_landing_handoff=1&openSignUp=1&openSignIn=1&gclid=google-1&fbclid=meta-1&ttclid=tiktok-1&msclkid=microsoft-1&oauth=error&message=bad&provider=google&foo=keep'
    )
  )

  assert.equal(routePath, '/?foo=keep')
})

test('buildTrackedRoutePath strips machine-readable OAuth error query keys', () => {
  const routePath = buildTrackedRoutePath(
    '/profile',
    toSearchParams('oauth=link_error&oauth_error=provider_account_conflict&provider=google&message=conflict&tab=account')
  )

  assert.equal(routePath, '/profile?tab=account')
})
