import test from 'node:test'
import assert from 'node:assert/strict'

import {
  USER_ACTIVITY_STATE_REFRESH_INTERVAL_MS,
  recordUserActivityState,
  refreshUserActivityStateIfStale,
  shouldRefreshUserActivityState
} from './user-activity-state-service'

type UpsertInput = {
  where: {
    userId: string
  }
  create: {
    userId: string
    lastSeenAt: Date
    createdAt: Date
    updatedAt: Date
  }
  update: {
    lastSeenAt: Date
    updatedAt: Date
  }
}

const createActivityDb = (options: { error?: unknown } = {}) => {
  const upsertCalls: UpsertInput[] = []

  return {
    upsertCalls,
    db: {
      userActivityState: {
        upsert: async (input: UpsertInput) => {
          upsertCalls.push(input)
          if (options.error) {
            throw options.error
          }

          return {
            userId: input.where.userId,
            lastSeenAt: input.update.lastSeenAt
          }
        }
      }
    }
  }
}

test('shouldRefreshUserActivityState returns false while activity is inside the freshness window', () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const recentLastSeenAt = new Date(now.getTime() - USER_ACTIVITY_STATE_REFRESH_INTERVAL_MS + 1)

  assert.equal(shouldRefreshUserActivityState(recentLastSeenAt, now), false)
})

test('shouldRefreshUserActivityState returns true for missing or stale activity', () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const staleLastSeenAt = new Date(now.getTime() - USER_ACTIVITY_STATE_REFRESH_INTERVAL_MS)

  assert.equal(shouldRefreshUserActivityState(null, now), true)
  assert.equal(shouldRefreshUserActivityState(staleLastSeenAt, now), true)
})

test('recordUserActivityState upserts durable activity without session secrets or client metadata', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const { db, upsertCalls } = createActivityDb()

  const result = await recordUserActivityState({
    db: db as never,
    userId: 'user-1',
    lastSeenAt: now
  })

  assert.deepEqual(result, { status: 'recorded' })
  assert.equal(upsertCalls.length, 1)
  assert.deepEqual(upsertCalls[0], {
    where: {
      userId: 'user-1'
    },
    create: {
      userId: 'user-1',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now
    },
    update: {
      lastSeenAt: now,
      updatedAt: now
    }
  })

  const serializedCall = JSON.stringify(upsertCalls[0])
  assert.equal(serializedCall.includes('token'), false)
  assert.equal(serializedCall.includes('127.0.0.1'), false)
  assert.equal(serializedCall.includes('user-agent'), false)
})

test('refreshUserActivityStateIfStale skips fresh activity', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const { db, upsertCalls } = createActivityDb()

  const result = await refreshUserActivityStateIfStale({
    db: db as never,
    userId: 'user-1',
    lastSeenAt: new Date('2026-05-18T11:59:00.000Z'),
    now
  })

  assert.deepEqual(result, { status: 'fresh' })
  assert.equal(upsertCalls.length, 0)
})

test('refreshUserActivityStateIfStale records stale activity', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const { db, upsertCalls } = createActivityDb()

  const result = await refreshUserActivityStateIfStale({
    db: db as never,
    userId: 'user-1',
    lastSeenAt: new Date('2026-05-18T11:54:59.000Z'),
    now
  })

  assert.deepEqual(result, { status: 'recorded' })
  assert.equal(upsertCalls.length, 1)
})

test('recordUserActivityState logs sanitized pressure and preserves auth flow', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const warnings: unknown[] = []
  const { db } = createActivityDb({
    error: Object.assign(new Error('timeout near raw-cookie-token and 127.0.0.1'), {
      code: 'P1008'
    })
  })

  const result = await recordUserActivityState({
    db: db as never,
    userId: 'user-1',
    lastSeenAt: now,
    warningLogger: (warning) => warnings.push(warning)
  })

  assert.deepEqual(result, {
    status: 'pressure_ignored',
    reason: 'query_timeout'
  })
  assert.equal(warnings.length, 1)

  const serializedWarning = JSON.stringify(warnings[0])
  assert.match(serializedWarning, /user_activity_state_record/)
  assert.equal(serializedWarning.includes('user-1'), false)
  assert.equal(serializedWarning.includes('raw-cookie-token'), false)
  assert.equal(serializedWarning.includes('127.0.0.1'), false)
})

test('recordUserActivityState rethrows unclassified errors', async () => {
  const { db } = createActivityDb({
    error: new Error('unexpected persistence failure')
  })

  await assert.rejects(
    recordUserActivityState({
      db: db as never,
      userId: 'user-1',
      lastSeenAt: new Date('2026-05-18T12:00:00.000Z')
    }),
    /unexpected persistence failure/
  )
})
