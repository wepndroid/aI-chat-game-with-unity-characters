import test from 'node:test'
import assert from 'node:assert/strict'

import { getMarketingDashboardData } from './marketing-segment-service'

const NOW = new Date('2026-05-22T10:22:25.000Z')
const CREATED_AT = new Date('2026-04-22T10:22:25.000Z')
const LAST_SEEN_AT = new Date('2026-05-20T10:22:25.000Z')
const CHARGED_AT = new Date('2026-04-21T16:55:09.000Z')
const PAST_NEXT_CHARGE_DATE = new Date('2026-05-22T00:00:00.000Z')

const makeUser = (overrides: Record<string, any>) => ({
  id: 'user',
  email: 'user@example.test',
  username: 'user',
  isEmailVerified: true,
  createdAt: CREATED_AT,
  activityState: {
    lastSeenAt: LAST_SEEN_AT
  },
  patreonAccount: null,
  entitlementGrants: [],
  revenueEvents: [],
  _count: {
    chatSessions: 1
  },
  ...overrides
})

test('marketing dashboard treats active entitlements as current subscriptions even when Patreon next charge date is stale', async () => {
  const calls: Array<{ name: string; query: unknown }> = []
  const db = {
    user: {
      findMany: async (query: unknown) => {
        calls.push({
          name: 'user.findMany',
          query
        })
        return [
          makeUser({
            id: 'active-renewal-day-user',
            username: 'active-user',
            patreonAccount: {
              membershipStatus: 'active_patron',
              tierCents: 1299,
              pledgeCadenceMonths: 1,
              lastChargeDate: CHARGED_AT,
              nextChargeDate: PAST_NEXT_CHARGE_DATE
            },
            entitlementGrants: [
              {
                tierCode: 'premium',
                updatedAt: NOW
              }
            ],
            revenueEvents: [
              {
                amountCents: 1299,
                chargedAt: CHARGED_AT
              }
            ]
          }),
          makeUser({
            id: 'canceled-user',
            username: 'canceled-user',
            patreonAccount: {
              membershipStatus: 'former_patron',
              tierCents: 1299,
              pledgeCadenceMonths: 1,
              lastChargeDate: CHARGED_AT,
              nextChargeDate: PAST_NEXT_CHARGE_DATE
            },
            revenueEvents: [
              {
                amountCents: 1299,
                chargedAt: CHARGED_AT
              }
            ]
          })
        ]
      }
    }
  }

  const report = await getMarketingDashboardData({
    db: db as never,
    now: NOW
  })

  assert.equal(report.summary.winBackCandidates, 1)
  assert.deepEqual(
    report.segments.winBackCandidates.allRecords.map((record) => record.id),
    ['canceled-user']
  )

  const userQuery = calls.find((call) => call.name === 'user.findMany')?.query as Record<string, any>
  assert.ok(userQuery.select.entitlementGrants, 'Expected marketing dashboard to select active entitlements.')
})
