import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'

import { LANDING_VISITOR_COOKIE_NAME, trackLandingPageVisit } from './landing-page-attribution-service'

const NOW = new Date('2026-05-14T12:00:00.000Z')

type TrackingIssue = {
  kind: string
  landingPageKey: string | null
  variantKey: string | null
  routePath: string | null
  shortUrlKey: string | null
}

const createRequest = (cookies: Record<string, string> = {}) =>
  ({
    cookies
  }) as Request

const createResponse = () => {
  const cookies: Array<{ name: string; value: string; options: unknown }> = []

  return {
    cookies,
    response: {
      cookie: (name: string, value: string, options: unknown) => {
        cookies.push({ name, value, options })
      }
    } as Response
  }
}

const createAttributionDb = (input: {
  landingPage?: unknown | null
  variant?: unknown | null
  controlVariants?: unknown[]
  shortUrl?: unknown | null
}) => {
  const calls: Array<[string, unknown]> = []

  return {
    calls,
    db: {
      landingPage: {
        findUnique: async (query: unknown) => {
          calls.push(['landingPage.findUnique', query])
          return input.landingPage ?? null
        },
        upsert: async () => {
          throw new Error('public tracking must not mutate landing-page catalog rows')
        }
      },
      landingPageVariant: {
        findUnique: async (query: unknown) => {
          calls.push(['landingPageVariant.findUnique', query])
          return input.variant ?? null
        },
        findMany: async (query: unknown) => {
          calls.push(['landingPageVariant.findMany', query])
          return input.controlVariants ?? []
        },
        upsert: async () => {
          throw new Error('public tracking must not mutate landing-page variant catalog rows')
        }
      },
      landingPageShortUrl: {
        findUnique: async (query: unknown) => {
          calls.push(['landingPageShortUrl.findUnique', query])
          return input.shortUrl ?? null
        }
      },
      landingPageVisit: {
        upsert: async (query: unknown) => {
          calls.push(['landingPageVisit.upsert', query])
          return {
            id: 'visit-1'
          }
        }
      }
    }
  }
}

test('trackLandingPageVisit records visits against existing catalog rows without mutating catalog configuration', async () => {
  const { response, cookies } = createResponse()
  const { db, calls } = createAttributionDb({
    landingPage: {
      id: 'landing-page-1',
      key: 'lp-chat',
      name: 'Ahri Chat',
      isActive: true
    },
    variant: {
      id: 'variant-control',
      landingPageId: 'landing-page-1',
      key: 'default',
      name: 'Default Route',
      routePath: '/lp-chat',
      isActive: true,
      landingPage: {
        key: 'lp-chat',
        name: 'Ahri Chat'
      }
    }
  })

  const result = await trackLandingPageVisit(
    createRequest(),
    response,
    {
      landingPageKey: 'LP Chat',
      landingPageName: 'Public name must be ignored',
      variantKey: 'Default',
      variantName: 'Public variant must be ignored',
      shortUrlKey: null,
      routePath: '/',
      source: 'newsletter',
      userAgent: 'test-browser',
      gaClientId: '1234567890.9876543210',
      gaSessionId: '1779186012'
    },
    {
      db: db as never,
      now: NOW,
      recordTrackingIssue: async () => {
        throw new Error('valid tracking should not record a mismatch issue')
      }
    }
  )

  assert.equal(result.tracked, true)
  assert.deepEqual(result, {
    tracked: true,
    visitorId: cookies[0]?.value,
    visitId: 'visit-1',
    landingPageKey: 'lp-chat',
    variantKey: 'default',
    shortUrlKey: null
  })
  assert.equal(cookies[0]?.name, LANDING_VISITOR_COOKIE_NAME)

  assert.deepEqual(
    calls.map(([name]) => name),
    ['landingPage.findUnique', 'landingPageVariant.findUnique', 'landingPageVisit.upsert']
  )
  const visitUpsert = calls.find(([name]) => name === 'landingPageVisit.upsert')?.[1] as {
    create: Record<string, unknown>
    update: Record<string, unknown>
  }
  assert.equal(visitUpsert.create.landingPageId, 'landing-page-1')
  assert.equal(visitUpsert.create.variantId, 'variant-control')
  assert.equal(visitUpsert.create.entryPath, '/')
  assert.equal(visitUpsert.update.entryPath, '/')
  assert.equal(visitUpsert.create.source, 'newsletter')
  assert.equal(visitUpsert.create.userAgent, 'test-browser')
  assert.equal(visitUpsert.create.gaClientId, '1234567890.9876543210')
  assert.equal(visitUpsert.create.gaSessionId, '1779186012')
  assert.equal(visitUpsert.update.gaClientId, '1234567890.9876543210')
  assert.equal(visitUpsert.update.gaSessionId, '1779186012')
})

test('trackLandingPageVisit rejects unknown landing pages and records a sanitized issue without creating catalog rows', async () => {
  const issues: TrackingIssue[] = []
  const { db, calls } = createAttributionDb({
    landingPage: null
  })

  const result = await trackLandingPageVisit(
    createRequest({
      [LANDING_VISITOR_COOKIE_NAME]: 'visitor-1'
    }),
    createResponse().response,
    {
      landingPageKey: ' Missing Landing ',
      variantKey: 'Default',
      shortUrlKey: ' Paid Link ',
      routePath: '/?token=secret'
    },
    {
      db: db as never,
      now: NOW,
      recordTrackingIssue: async (issue) => {
        issues.push(issue)
      }
    }
  )

  assert.deepEqual(result, { tracked: false })
  assert.deepEqual(
    calls.map(([name]) => name),
    ['landingPage.findUnique']
  )
  assert.deepEqual(issues, [
    {
      kind: 'UNKNOWN_LANDING_PAGE',
      landingPageKey: 'missing-landing',
      variantKey: 'default',
      routePath: '/',
      shortUrlKey: 'paid-link'
    }
  ])
})

test('trackLandingPageVisit falls back to the single active control variant when the public variant key is unknown', async () => {
  const issues: TrackingIssue[] = []
  const { db, calls } = createAttributionDb({
    landingPage: {
      id: 'landing-page-1',
      key: 'lp-chat',
      name: 'Ahri Chat',
      isActive: true
    },
    variant: null,
    controlVariants: [
      {
        id: 'variant-control',
        landingPageId: 'landing-page-1',
        key: 'default',
        name: 'Default Route',
        routePath: '/lp-chat',
        isActive: true,
        landingPage: {
          key: 'lp-chat',
          name: 'Ahri Chat'
        }
      }
    ]
  })

  const result = await trackLandingPageVisit(
    createRequest({
      [LANDING_VISITOR_COOKIE_NAME]: 'visitor-1'
    }),
    createResponse().response,
    {
      landingPageKey: 'lp-chat',
      variantKey: 'not-configured',
      routePath: '/lp-chat'
    },
    {
      db: db as never,
      now: NOW,
      recordTrackingIssue: async (issue) => {
        issues.push(issue)
      }
    }
  )

  assert.deepEqual(result, {
    tracked: true,
    visitorId: 'visitor-1',
    visitId: 'visit-1',
    landingPageKey: 'lp-chat',
    variantKey: 'default',
    shortUrlKey: null
  })
  assert.deepEqual(
    calls.map(([name]) => name),
    ['landingPage.findUnique', 'landingPageVariant.findUnique', 'landingPageVariant.findMany', 'landingPageVisit.upsert']
  )
  assert.equal((calls.find(([name]) => name === 'landingPageVisit.upsert')?.[1] as { create: Record<string, unknown> }).create.variantId, 'variant-control')
  assert.deepEqual(issues, [
    {
      kind: 'UNKNOWN_VARIANT',
      landingPageKey: 'lp-chat',
      variantKey: 'not-configured',
      routePath: '/lp-chat',
      shortUrlKey: null
    }
  ])
})

test('trackLandingPageVisit rejects unknown variants when no single active control variant exists', async () => {
  const issues: TrackingIssue[] = []
  const { db, calls } = createAttributionDb({
    landingPage: {
      id: 'landing-page-1',
      key: 'lp-chat',
      name: 'Ahri Chat',
      isActive: true
    },
    variant: null,
    controlVariants: []
  })

  const result = await trackLandingPageVisit(
    createRequest({
      [LANDING_VISITOR_COOKIE_NAME]: 'visitor-1'
    }),
    createResponse().response,
    {
      landingPageKey: 'lp-chat',
      variantKey: 'not-configured',
      routePath: '/lp-chat'
    },
    {
      db: db as never,
      now: NOW,
      recordTrackingIssue: async (issue) => {
        issues.push(issue)
      }
    }
  )

  assert.deepEqual(result, { tracked: false })
  assert.deepEqual(
    calls.map(([name]) => name),
    ['landingPage.findUnique', 'landingPageVariant.findUnique', 'landingPageVariant.findMany']
  )
  assert.deepEqual(issues, [
    {
      kind: 'UNKNOWN_VARIANT',
      landingPageKey: 'lp-chat',
      variantKey: 'not-configured',
      routePath: '/lp-chat',
      shortUrlKey: null
    },
    {
      kind: 'MISSING_CONTROL_VARIANT',
      landingPageKey: 'lp-chat',
      variantKey: 'not-configured',
      routePath: '/lp-chat',
      shortUrlKey: null
    }
  ])
})
