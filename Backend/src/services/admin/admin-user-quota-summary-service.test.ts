import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdminUserQuotaSummaries } from './admin-user-quota-summary-service'

const NOW = new Date('2026-05-11T12:00:00.000Z')

const findCapturedCall = (calls: Array<[string, unknown]>, name: string) => {
  const call = calls.find(([callName]) => callName === name)

  assert.ok(call, `Expected ${name} to be called.`)
  return call[1] as Record<string, any>
}

const createReadOnlyDb = (input: {
  users: unknown[]
  tiers?: unknown[]
  periods?: unknown[]
  usages?: unknown[]
  reservations?: unknown[]
}) => {
  const calls: Array<[string, unknown]> = []

  return {
    calls,
    db: {
      user: {
        findMany: async (query: unknown) => {
          calls.push(['user.findMany', query])
          return input.users
        }
      },
      tier: {
        findMany: async (query: unknown) => {
          calls.push(['tier.findMany', query])
          return input.tiers ?? []
        }
      },
      chatQuotaPeriod: {
        findMany: async (query: unknown) => {
          calls.push(['chatQuotaPeriod.findMany', query])
          return input.periods ?? []
        }
      },
      chatMessageUsage: {
        findMany: async (query: unknown) => {
          calls.push(['chatMessageUsage.findMany', query])
          return input.usages ?? []
        }
      },
      chatQuotaReservation: {
        findMany: async (query: unknown) => {
          calls.push(['chatQuotaReservation.findMany', query])
          return input.reservations ?? []
        }
      }
    }
  }
}

test('buildAdminUserQuotaSummaries returns product quota tiers without using mutation APIs', async () => {
  const { db, calls } = createReadOnlyDb({
    users: [
      {
        id: 'free-user',
        role: 'USER',
        tierCode: null,
        tier: null,
        entitlementGrants: [],
        patreonAccount: null
      },
      {
        id: 'basic-user',
        role: 'USER',
        tierCode: 'basic',
        tier: {
          code: 'basic',
          messageLimit: 777,
          periodDays: 30
        },
        entitlementGrants: [],
        patreonAccount: null
      },
      {
        id: 'premium-user',
        role: 'USER',
        tierCode: null,
        tier: null,
        entitlementGrants: [
          {
            tierCode: 'premium'
          }
        ],
        patreonAccount: null
      },
      {
        id: 'admin-user',
        role: 'ADMIN',
        tierCode: null,
        tier: null,
        entitlementGrants: [],
        patreonAccount: null
      }
    ]
  })

  const summaries = await buildAdminUserQuotaSummaries(['free-user', 'basic-user', 'premium-user', 'admin-user'], {
    db: db as never,
    now: NOW
  })

  assert.deepEqual(
    summaries.map((summary) => ({
      userId: summary.userId,
      tierCode: summary.tierCode,
      messageLimit: summary.message.limit,
      messageRemaining: summary.message.remaining,
      messageUnlimited: summary.message.unlimited,
      voiceEnabled: summary.voice.enabled,
      voiceLimit: summary.voice.limit,
      voiceRemaining: summary.voice.remaining,
      voiceUnlimited: summary.voice.unlimited
    })),
    [
      {
        userId: 'free-user',
        tierCode: 'free',
        messageLimit: 0,
        messageRemaining: 0,
        messageUnlimited: false,
        voiceEnabled: false,
        voiceLimit: 0,
        voiceRemaining: 0,
        voiceUnlimited: false
      },
      {
        userId: 'basic-user',
        tierCode: 'basic',
        messageLimit: 1000,
        messageRemaining: 1000,
        messageUnlimited: false,
        voiceEnabled: true,
        voiceLimit: 50,
        voiceRemaining: 50,
        voiceUnlimited: false
      },
      {
        userId: 'premium-user',
        tierCode: 'premium',
        messageLimit: null,
        messageRemaining: null,
        messageUnlimited: true,
        voiceEnabled: true,
        voiceLimit: null,
        voiceRemaining: null,
        voiceUnlimited: true
      },
      {
        userId: 'admin-user',
        tierCode: 'admin',
        messageLimit: null,
        messageRemaining: null,
        messageUnlimited: true,
        voiceEnabled: true,
        voiceLimit: null,
        voiceRemaining: null,
        voiceUnlimited: true
      }
    ]
  )

  assert.deepEqual(
    calls.map(([name]) => name),
    ['user.findMany', 'tier.findMany', 'chatQuotaPeriod.findMany', 'chatMessageUsage.findMany', 'chatQuotaReservation.findMany']
  )

  const userQuery = findCapturedCall(calls, 'user.findMany')
  assert.deepEqual(userQuery.select.entitlementGrants.orderBy, {
    updatedAt: 'desc'
  })
  assert.equal(userQuery.select.entitlementGrants.select.tierCode, true)
  assert.equal(userQuery.select.entitlementGrants.select.updatedAt, true)
})

test('buildAdminUserQuotaSummaries includes existing usage and non-gameplay reservations for the current period', async () => {
  const periodStart = new Date('2026-05-01T00:00:00.000Z')
  const periodEnd = new Date('2026-06-01T00:00:00.000Z')
  const { db } = createReadOnlyDb({
    users: [
      {
        id: 'basic-user',
        role: 'USER',
        tierCode: 'basic',
        tier: null,
        entitlementGrants: [],
        patreonAccount: null
      }
    ],
    periods: [
      {
        userId: 'basic-user',
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
        tierCode: 'basic'
      }
    ],
    usages: [
      {
        userId: 'basic-user',
        periodStartAt: periodStart,
        messagesUsed: 7,
        voiceMessagesUsed: 2
      }
    ],
    reservations: [
      {
        userId: 'basic-user',
        periodStartAt: periodStart,
        requestId: 'text-turn',
        voiceRequested: false
      },
      {
        userId: 'basic-user',
        periodStartAt: periodStart,
        requestId: 'voice-turn',
        voiceRequested: true
      },
      {
        userId: 'basic-user',
        periodStartAt: periodStart,
        requestId: 'gameplay:undress',
        voiceRequested: true
      }
    ]
  })

  const [summary] = await buildAdminUserQuotaSummaries(['basic-user'], {
    db: db as never,
    now: NOW
  })

  assert.equal(summary.periodEndsAt, '2026-06-01T00:00:00.000Z')
  assert.deepEqual(summary.message, {
    limit: 1000,
    used: 7,
    reserved: 2,
    remaining: 991,
    unlimited: false
  })
  assert.deepEqual(summary.voice, {
    enabled: true,
    limit: 50,
    used: 2,
    reserved: 1,
    remaining: 47,
    unlimited: false
  })
})
