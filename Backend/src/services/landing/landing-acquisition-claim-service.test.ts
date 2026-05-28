import assert from 'node:assert/strict'
import test from 'node:test'

import {
  claimLandingAcquisitionForUser,
  type LandingAcquisitionClaimDatabase
} from './landing-acquisition-claim-service'
import type { LandingAttributionSnapshot } from './landing-page-attribution-service'

const NOW = new Date('2026-05-18T03:00:00.000Z')
const SOURCE_FIRST_VISITED_AT = new Date('2026-05-17T10:00:00.000Z')
const SOURCE_LAST_VISITED_AT = new Date('2026-05-17T10:05:00.000Z')
const SOURCE_SIGNUP_CLICKED_AT = new Date('2026-05-17T10:06:00.000Z')

type StoredUser = {
  id: string
  acquisitionVisitId: string | null
}

type StoredVisit = {
  id: string
  landingPageId: string
  variantId: string
  shortUrlId: string | null
  visitorId: string
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  attributionKey: string | null
  referrerHost: string | null
  entryPath: string | null
  landingUrl: string | null
  userAgent: string | null
  gaClientId: string | null
  gaSessionId: string | null
  signupClickedAt: Date | null
  signedUpUserId: string | null
  signupCompletedAt: Date | null
  firstVisitedAt: Date
  lastVisitedAt: Date
}

const createAttribution = (visitId = 'visit-source'): LandingAttributionSnapshot => ({
  visitId,
  landingPageId: 'landing-page-1',
  landingPageKey: 'lp-chat',
  landingPageName: 'Ahri Chat',
  variantId: 'variant-control',
  variantKey: 'default',
  variantName: 'Default Route',
  shortUrlKey: 'paid-link',
  routePath: '/lp-chat',
  source: 'newsletter',
  medium: 'email',
  campaign: 'spring',
  content: 'hero',
  term: 'waifu-chat',
  referrerHost: 'example.test',
  firstVisitedAt: SOURCE_FIRST_VISITED_AT,
  lastVisitedAt: SOURCE_LAST_VISITED_AT,
  gaClientId: '1234567890.9876543210',
  gaSessionId: '1779186012'
})

const createSourceVisit = (overrides: Partial<StoredVisit> = {}): StoredVisit => ({
  id: 'visit-source',
  landingPageId: 'landing-page-1',
  variantId: 'variant-control',
  shortUrlId: 'short-url-1',
  visitorId: 'visitor-shared-browser',
  source: 'newsletter',
  medium: 'email',
  campaign: 'spring',
  content: 'hero',
  term: 'waifu-chat',
  attributionKey: 'variant-control:short:short-url-1',
  referrerHost: 'example.test',
  entryPath: '/lp-chat',
  landingUrl: 'https://secretwaifu.example/lp-chat?utm_campaign=spring',
  userAgent: 'test-browser',
  gaClientId: '1234567890.9876543210',
  gaSessionId: '1779186012',
  signupClickedAt: SOURCE_SIGNUP_CLICKED_AT,
  signedUpUserId: null,
  signupCompletedAt: null,
  firstVisitedAt: SOURCE_FIRST_VISITED_AT,
  lastVisitedAt: SOURCE_LAST_VISITED_AT,
  ...overrides
})

const createClaimDb = (input: {
  users: StoredUser[]
  visits: StoredVisit[]
  transactionError?: unknown
}) => {
  const calls: Array<[string, unknown]> = []
  const users = new Map(input.users.map((user) => [user.id, { ...user }]))
  const visits = new Map(input.visits.map((visit) => [visit.id, { ...visit }]))

  const db = {
    user: {
      findUnique: async (query: { where: { id: string } }) => {
        calls.push(['user.findUnique', query])
        return users.get(query.where.id) ?? null
      },
      update: async (query: { where: { id: string }; data: { acquisitionVisitId: string } }) => {
        calls.push(['user.update', query])
        const existing = users.get(query.where.id)

        if (!existing) {
          throw new Error(`Unknown test user ${query.where.id}`)
        }

        existing.acquisitionVisitId = query.data.acquisitionVisitId
        return existing
      }
    },
    landingPageVisit: {
      findUnique: async (query: { where: { id?: string; visitorId_attributionKey?: { visitorId: string; attributionKey: string } } }) => {
        calls.push(['landingPageVisit.findUnique', query])

        if (query.where.id) {
          return visits.get(query.where.id) ?? null
        }

        const key = query.where.visitorId_attributionKey

        if (!key) {
          return null
        }

        return [...visits.values()].find(
          (visit) => visit.visitorId === key.visitorId && visit.attributionKey === key.attributionKey
        ) ?? null
      },
      update: async (query: {
        where: { id: string }
        data: { signedUpUserId?: string; signupCompletedAt?: Date }
      }) => {
        calls.push(['landingPageVisit.update', query])
        const existing = visits.get(query.where.id)

        if (!existing) {
          throw new Error(`Unknown test visit ${query.where.id}`)
        }

        existing.signedUpUserId = query.data.signedUpUserId ?? existing.signedUpUserId
        existing.signupCompletedAt = query.data.signupCompletedAt ?? existing.signupCompletedAt
        return existing
      },
      updateMany: async (query: {
        where: { id: string; signedUpUserId: string | null }
        data: { signedUpUserId: string; signupCompletedAt: Date }
      }) => {
        calls.push(['landingPageVisit.updateMany', query])
        const existing = visits.get(query.where.id)

        if (!existing || existing.signedUpUserId !== query.where.signedUpUserId) {
          return {
            count: 0
          }
        }

        existing.signedUpUserId = query.data.signedUpUserId
        existing.signupCompletedAt = query.data.signupCompletedAt
        return {
          count: 1
        }
      },
      upsert: async (query: {
        where: { visitorId_attributionKey: { visitorId: string; attributionKey: string } }
        create: Omit<StoredVisit, 'id' | 'signupCompletedAt' | 'signedUpUserId'> & {
          signedUpUserId: string
          signupCompletedAt: Date
        }
        update: { signedUpUserId: string; signupCompletedAt: Date }
      }) => {
        calls.push(['landingPageVisit.upsert', query])
        const existing = [...visits.values()].find(
          (visit) =>
            visit.visitorId === query.where.visitorId_attributionKey.visitorId &&
            visit.attributionKey === query.where.visitorId_attributionKey.attributionKey
        )

        if (existing) {
          existing.signedUpUserId = query.update.signedUpUserId
          existing.signupCompletedAt = query.update.signupCompletedAt
          return existing
        }

        const created = {
          ...query.create,
          id: `fresh-${query.create.attributionKey}`
        }
        visits.set(created.id, created)
        return created
      }
    },
    $transaction: async <T>(callback: (transactionClient: unknown) => Promise<T>) => {
      calls.push(['$transaction', null])

      if (input.transactionError) {
        throw input.transactionError
      }

      return callback(db)
    }
  }

  return {
    calls,
    users,
    visits,
    db: db as unknown as LandingAcquisitionClaimDatabase
  }
}

test('claimLandingAcquisitionForUser claims an unclaimed source visit for the signing-in user', async () => {
  const { db, users, visits } = createClaimDb({
    users: [
      {
        id: 'user-1',
        acquisitionVisitId: null
      }
    ],
    visits: [
      createSourceVisit()
    ]
  })

  const result = await claimLandingAcquisitionForUser('user-1', createAttribution(), {
    db,
    now: () => NOW
  })

  assert.deepEqual(result, {
    outcome: 'claimed',
    visitId: 'visit-source'
  })
  assert.equal(users.get('user-1')?.acquisitionVisitId, 'visit-source')
  assert.equal(visits.get('visit-source')?.signedUpUserId, 'user-1')
  assert.equal(visits.get('visit-source')?.signupCompletedAt?.toISOString(), NOW.toISOString())
})

test('claimLandingAcquisitionForUser creates a deterministic fresh visit when the source visit belongs to another user', async () => {
  const { db, users, visits } = createClaimDb({
    users: [
      {
        id: 'user-b',
        acquisitionVisitId: null
      }
    ],
    visits: [
      createSourceVisit({
        signedUpUserId: 'user-a',
        signupCompletedAt: new Date('2026-05-17T11:00:00.000Z')
      })
    ]
  })

  const result = await claimLandingAcquisitionForUser('user-b', createAttribution(), {
    db,
    now: () => NOW
  })

  const expectedAttributionKey = 'signup:user-b:visit-source'
  const expectedVisitId = `fresh-${expectedAttributionKey}`
  const freshVisit = visits.get(expectedVisitId)

  assert.deepEqual(result, {
    outcome: 'fresh_visit_created_for_user',
    visitId: expectedVisitId
  })
  assert.equal(users.get('user-b')?.acquisitionVisitId, expectedVisitId)
  assert.equal(freshVisit?.visitorId, 'visitor-shared-browser')
  assert.equal(freshVisit?.attributionKey, expectedAttributionKey)
  assert.equal(freshVisit?.landingPageId, 'landing-page-1')
  assert.equal(freshVisit?.variantId, 'variant-control')
  assert.equal(freshVisit?.shortUrlId, 'short-url-1')
  assert.equal(freshVisit?.source, 'newsletter')
  assert.equal(freshVisit?.medium, 'email')
  assert.equal(freshVisit?.campaign, 'spring')
  assert.equal(freshVisit?.content, 'hero')
  assert.equal(freshVisit?.term, 'waifu-chat')
  assert.equal(freshVisit?.referrerHost, 'example.test')
  assert.equal(freshVisit?.entryPath, '/lp-chat')
  assert.equal(freshVisit?.landingUrl, 'https://secretwaifu.example/lp-chat?utm_campaign=spring')
  assert.equal(freshVisit?.userAgent, 'test-browser')
  assert.equal(freshVisit?.gaClientId, '1234567890.9876543210')
  assert.equal(freshVisit?.gaSessionId, '1779186012')
  assert.equal(freshVisit?.signupClickedAt?.toISOString(), SOURCE_SIGNUP_CLICKED_AT.toISOString())
  assert.equal(freshVisit?.firstVisitedAt.toISOString(), SOURCE_FIRST_VISITED_AT.toISOString())
  assert.equal(freshVisit?.lastVisitedAt.toISOString(), SOURCE_LAST_VISITED_AT.toISOString())
  assert.equal(freshVisit?.signedUpUserId, 'user-b')
  assert.equal(freshVisit?.signupCompletedAt?.toISOString(), NOW.toISOString())
})

test('claimLandingAcquisitionForUser reuses the deterministic fresh visit on retry', async () => {
  const existingFreshVisit = createSourceVisit({
    id: 'fresh-signup:user-b:visit-source',
    attributionKey: 'signup:user-b:visit-source',
    signedUpUserId: 'user-b',
    signupCompletedAt: NOW
  })
  const { db, calls, users } = createClaimDb({
    users: [
      {
        id: 'user-b',
        acquisitionVisitId: null
      }
    ],
    visits: [
      createSourceVisit({
        signedUpUserId: 'user-a',
        signupCompletedAt: new Date('2026-05-17T11:00:00.000Z')
      }),
      existingFreshVisit
    ]
  })

  const result = await claimLandingAcquisitionForUser('user-b', createAttribution(), {
    db,
    now: () => NOW
  })

  assert.deepEqual(result, {
    outcome: 'fresh_visit_created_for_user',
    visitId: existingFreshVisit.id
  })
  assert.equal(users.get('user-b')?.acquisitionVisitId, existingFreshVisit.id)
  assert.equal(calls.filter(([name]) => name === 'landingPageVisit.upsert').length, 1)
})

test('claimLandingAcquisitionForUser converts a residual unique race into a non-blocking outcome', async () => {
  const { db } = createClaimDb({
    users: [
      {
        id: 'user-1',
        acquisitionVisitId: null
      }
    ],
    visits: [
      createSourceVisit()
    ],
    transactionError: {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: {
        target: ['acquisitionVisitId']
      }
    }
  })

  const result = await claimLandingAcquisitionForUser('user-1', createAttribution(), {
    db,
    now: () => NOW
  })

  assert.deepEqual(result, {
    outcome: 'unique_constraint_race_ignored',
    visitId: null
  })
})
