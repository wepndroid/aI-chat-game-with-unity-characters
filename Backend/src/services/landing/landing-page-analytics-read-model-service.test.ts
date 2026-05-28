import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getLandingPagePerformanceReport,
  getLandingPageStatsOverview,
  getLandingPageTrafficReport
} from './landing-page-analytics-read-model-service'

const NOW = new Date('2026-05-19T09:00:00.000Z')
const CREATED_AT = new Date('2026-05-18T09:00:00.000Z')
const UPDATED_AT = new Date('2026-05-18T10:00:00.000Z')
const FIRST_VISITED_AT = new Date('2026-05-18T11:00:00.000Z')
const SIGNUP_CLICKED_AT = new Date('2026-05-18T11:05:00.000Z')
const SIGNUP_COMPLETED_AT = new Date('2026-05-18T11:10:00.000Z')
const CHARGED_AT = new Date('2026-05-18T11:30:00.000Z')

const landingPage = {
  id: 'landing-page-1',
  key: 'lp-chat',
  name: 'LP Chat',
  description: null,
  basePath: '/lp-chat',
  isActive: 1,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT
}

const shortUrl = {
  id: 'short-url-1',
  key: 'hentai',
  name: 'Hentai Campaign',
  description: null,
  utmSource: 'reddit',
  utmMedium: 'cpc',
  utmCampaign: 'launch',
  utmContent: null,
  utmTerm: null,
  isActive: true,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  targets: [
    {
      id: 'target-1',
      landingPageId: landingPage.id,
      weight: 100,
      landingPage: {
        id: landingPage.id,
        key: landingPage.key,
        name: landingPage.name,
        basePath: landingPage.basePath,
        isActive: true
      }
    }
  ]
}

const attributedUser = {
  id: 'user-1',
  email: 'paid@example.test',
  username: 'paid-user',
  createdAt: SIGNUP_COMPLETED_AT,
  patreonAccount: {
    membershipStatus: 'active_patron',
    tierCents: 1299,
    pledgeCadenceMonths: 1,
    lastChargeDate: null,
    nextChargeDate: null
  }
}

const visit = {
  id: 'visit-1',
  landingPageId: landingPage.id,
  visitorId: 'visitor-1',
  visitCount: 2,
  source: 'reddit',
  medium: 'cpc',
  campaign: 'launch',
  content: null,
  term: null,
  referrerHost: null,
  firstVisitedAt: FIRST_VISITED_AT,
  signupClickedAt: SIGNUP_CLICKED_AT,
  signedUpUserId: attributedUser.id,
  signupCompletedAt: SIGNUP_COMPLETED_AT,
  shortUrl: {
    id: shortUrl.id,
    key: shortUrl.key,
    name: shortUrl.name
  },
  landingPage: {
    id: landingPage.id,
    key: landingPage.key,
    name: landingPage.name,
    basePath: landingPage.basePath
  },
  attributedUser,
  revenueEvents: [
    {
      id: 'revenue-1',
      kind: 'INITIAL_PURCHASE',
      tierCode: 'basic',
      amountCents: 1299,
      chargedAt: CHARGED_AT
    }
  ]
}

const createReadModelDb = (input: {
  entitlements?: unknown[]
} = {}) => {
  const calls: Array<{ name: string; query: unknown }> = []
  const db = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      calls.push({
        name: '$queryRaw',
        query: strings.join('')
      })
      return [landingPage]
    },
    $transaction: async (queries: Array<Promise<unknown>>) => Promise.all(queries),
    landingPageShortUrl: {
      findMany: async (query: unknown) => {
        calls.push({
          name: 'landingPageShortUrl.findMany',
          query
        })
        return [shortUrl]
      }
    },
    landingPageVisit: {
      findMany: async (query: any) => {
        calls.push({
          name: 'landingPageVisit.findMany',
          query
        })

        if (query.where?.signedUpUserId?.not === null) {
          return [visit]
        }

        return [visit]
      }
    },
    entitlement: {
      findMany: async (query: unknown) => {
        calls.push({
          name: 'entitlement.findMany',
          query
        })
        return input.entitlements ?? [
          {
            userId: attributedUser.id,
            tierCode: 'premium',
            updatedAt: UPDATED_AT
          }
        ]
      }
    }
  }

  return {
    calls,
    db
  }
}

const assertUsesFlatSafeEntitlementFetch = (calls: Array<{ name: string; query: unknown }>) => {
  const visitQueries = calls.filter((call) => call.name === 'landingPageVisit.findMany')
  assert.ok(visitQueries.length > 0, 'Expected landing page visits to be queried.')
  assert.equal(JSON.stringify(visitQueries.map((call) => call.query)).includes('entitlementGrants'), false)

  const entitlementQuery = calls.find((call) => call.name === 'entitlement.findMany')?.query as Record<string, any>
  assert.ok(entitlementQuery, 'Expected active entitlements to be queried separately from visits.')
  assert.deepEqual(entitlementQuery.orderBy, [
    {
      userId: 'asc'
    },
    {
      updatedAt: 'desc'
    }
  ])
  assert.equal(entitlementQuery.select.userId, true)
  assert.equal(entitlementQuery.select.tierCode, true)
  assert.equal(entitlementQuery.select.updatedAt, true)
}

test('getLandingPageStatsOverview returns overview metrics without nested entitlement projections', async () => {
  const { db, calls } = createReadModelDb()

  const report = await getLandingPageStatsOverview({
    db: db as never,
    now: NOW
  })

  assert.equal(report.summary.totalLandingPages, 1)
  assert.equal(report.summary.uniqueVisitors, 1)
  assert.equal(report.summary.totalVisits, 2)
  assert.equal(report.summary.totalRevenueCents, 1299)
  assert.equal(report.summary.currentSubscribers, 1)
  assert.equal(report.summary.currentMonthlySubscriptionEarningCents, 1299)
  assert.equal(report.landingPages[0].kpis.currentSubscribers, 1)
  assert.equal(report.shortUrls[0].targets[0].totalRevenueCents, 1299)
  assertUsesFlatSafeEntitlementFetch(calls)
})

test('getLandingPageStatsOverview does not infer current subscribers from active Patreon billing rows without active entitlements', async () => {
  const { db } = createReadModelDb({
    entitlements: []
  })

  const report = await getLandingPageStatsOverview({
    db: db as never,
    now: NOW
  })

  assert.equal(report.summary.currentSubscribers, 0)
  assert.equal(report.summary.currentMonthlySubscriptionEarningCents, 0)
  assert.equal(report.landingPages[0].kpis.currentSubscribers, 0)
})

test('getLandingPageTrafficReport hydrates signed-up user rows from flat entitlements', async () => {
  const { db, calls } = createReadModelDb()

  const report = await getLandingPageTrafficReport({
    db: db as never,
    now: NOW
  })

  assert.equal(report.summary.attributedUsers, 1)
  assert.equal(report.summary.currentSubscribers, 1)
  assert.equal(report.users[0].userId, attributedUser.id)
  assert.equal(report.users[0].currentTierCents, 1299)
  assert.equal(report.users[0].purchaseHistory[0].amountCents, 1299)
  assert.equal(report.sources[0].currentSubscribers, 1)
  assertUsesFlatSafeEntitlementFetch(calls)
})

test('getLandingPagePerformanceReport computes performance metrics without nested entitlement projections', async () => {
  const { db, calls } = createReadModelDb()

  const report = await getLandingPagePerformanceReport({
    db: db as never,
    now: NOW
  })

  assert.equal(report.summary.totalLandingPages, 1)
  assert.equal(report.summary.currentSubscribers, 1)
  assert.equal(report.landingPages[0].dailyStats[0].currentSubscribers, 1)
  assert.equal(report.shortUrls[0].kpis.currentMonthlySubscriptionEarningCents, 1299)
  assertUsesFlatSafeEntitlementFetch(calls)
})
