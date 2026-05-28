import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SESSION_LAST_SEEN_REFRESH_INTERVAL_MS,
  refreshSessionLastSeenIfStale,
  shouldRefreshSessionLastSeen
} from './session-last-seen-policy'

type UpdateManyInput = {
  where: {
    id: string
    OR: Array<
      | {
          lastSeenAt: null
        }
      | {
          lastSeenAt: {
            lt: Date
          }
        }
    >
  }
  data: {
    lastSeenAt: Date
  }
}

const createLastSeenDb = (options: {
  error?: unknown
  result?: {
    count: number
  }
} = {}) => {
  const updateManyCalls: UpdateManyInput[] = []

  return {
    updateManyCalls,
    db: {
      session: {
        updateMany: async (input: UpdateManyInput) => {
          updateManyCalls.push(input)
          if (options.error) {
            throw options.error
          }

          return options.result ?? { count: 1 }
        }
      }
    }
  }
}

test('shouldRefreshSessionLastSeen returns false while lastSeenAt is inside the freshness window', () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const recentLastSeenAt = new Date(now.getTime() - SESSION_LAST_SEEN_REFRESH_INTERVAL_MS + 1)

  assert.equal(shouldRefreshSessionLastSeen(recentLastSeenAt, now), false)
})

test('shouldRefreshSessionLastSeen returns true when lastSeenAt is older than the freshness window', () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const staleLastSeenAt = new Date(now.getTime() - SESSION_LAST_SEEN_REFRESH_INTERVAL_MS - 1)

  assert.equal(shouldRefreshSessionLastSeen(staleLastSeenAt, now), true)
})

test('shouldRefreshSessionLastSeen treats null lastSeenAt as stale', () => {
  const now = new Date('2026-05-18T12:00:00.000Z')

  assert.equal(shouldRefreshSessionLastSeen(null, now), true)
})

test('shouldRefreshSessionLastSeen refreshes at the exact freshness boundary', () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const boundaryLastSeenAt = new Date(now.getTime() - SESSION_LAST_SEEN_REFRESH_INTERVAL_MS)

  assert.equal(shouldRefreshSessionLastSeen(boundaryLastSeenAt, now), true)
})

test('refreshSessionLastSeenIfStale skips the database write when the session is fresh', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const recentLastSeenAt = new Date(now.getTime() - SESSION_LAST_SEEN_REFRESH_INTERVAL_MS + 1)
  const { db, updateManyCalls } = createLastSeenDb()

  const result = await refreshSessionLastSeenIfStale({
    db: db as never,
    sessionId: 'session-1',
    lastSeenAt: recentLastSeenAt,
    now
  })

  assert.deepEqual(result, { status: 'fresh' })
  assert.equal(updateManyCalls.length, 0)
})

test('refreshSessionLastSeenIfStale conditionally updates stale sessions', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const staleLastSeenAt = new Date(now.getTime() - SESSION_LAST_SEEN_REFRESH_INTERVAL_MS - 1)
  const { db, updateManyCalls } = createLastSeenDb()

  const result = await refreshSessionLastSeenIfStale({
    db: db as never,
    sessionId: 'session-1',
    lastSeenAt: staleLastSeenAt,
    now
  })

  assert.deepEqual(result, { status: 'refreshed' })
  assert.equal(updateManyCalls.length, 1)
  assert.deepEqual(updateManyCalls[0], {
    where: {
      id: 'session-1',
      OR: [
        {
          lastSeenAt: null
        },
        {
          lastSeenAt: {
            lt: new Date('2026-05-18T11:55:00.000Z')
          }
        }
      ]
    },
    data: {
      lastSeenAt: now
    }
  })
})

test('refreshSessionLastSeenIfStale treats zero updated rows as a concurrent refresh', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const staleLastSeenAt = new Date(now.getTime() - SESSION_LAST_SEEN_REFRESH_INTERVAL_MS)
  const { db } = createLastSeenDb({
    result: {
      count: 0
    }
  })

  const result = await refreshSessionLastSeenIfStale({
    db: db as never,
    sessionId: 'session-1',
    lastSeenAt: staleLastSeenAt,
    now
  })

  assert.deepEqual(result, { status: 'already_refreshed' })
})

test('refreshSessionLastSeenIfStale logs sanitized P1008 pressure and preserves the valid session', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const staleLastSeenAt = new Date(now.getTime() - SESSION_LAST_SEEN_REFRESH_INTERVAL_MS)
  const warnings: unknown[] = []
  const pressureError = Object.assign(
    new Error('Socket timeout containing sw_session=secret-token and private@example.com'),
    {
      code: 'P1008'
    }
  )
  const { db } = createLastSeenDb({
    error: pressureError
  })

  const result = await refreshSessionLastSeenIfStale({
    db: db as never,
    sessionId: 'session-1',
    lastSeenAt: staleLastSeenAt,
    now,
    warningLogger: (warning) => warnings.push(warning)
  })

  assert.deepEqual(result, {
    status: 'pressure_ignored',
    reason: 'query_timeout'
  })
  assert.equal(warnings.length, 1)

  const serializedWarning = JSON.stringify(warnings[0])
  assert.match(serializedWarning, /session_last_seen_refresh/)
  assert.match(serializedWarning, /query_timeout/)
  assert.equal(serializedWarning.includes('session-1'), false)
  assert.equal(serializedWarning.includes('sw_session'), false)
  assert.equal(serializedWarning.includes('secret-token'), false)
  assert.equal(serializedWarning.includes('private@example.com'), false)
})

test('refreshSessionLastSeenIfStale logs sanitized P2028 pressure and preserves the valid session', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const staleLastSeenAt = new Date(now.getTime() - SESSION_LAST_SEEN_REFRESH_INTERVAL_MS)
  const warnings: unknown[] = []
  const pressureError = {
    code: 'P2028',
    message: 'Transaction already closed: expired transaction after reading bearer-token'
  }
  const { db } = createLastSeenDb({
    error: pressureError
  })

  const result = await refreshSessionLastSeenIfStale({
    db: db as never,
    sessionId: 'session-1',
    lastSeenAt: staleLastSeenAt,
    now,
    warningLogger: (warning) => warnings.push(warning)
  })

  assert.deepEqual(result, {
    status: 'pressure_ignored',
    reason: 'transaction_expired'
  })
  assert.equal(warnings.length, 1)

  const serializedWarning = JSON.stringify(warnings[0])
  assert.match(serializedWarning, /transaction_expired/)
  assert.equal(serializedWarning.includes('bearer-token'), false)
})

test('refreshSessionLastSeenIfStale rethrows unclassified errors', async () => {
  const now = new Date('2026-05-18T12:00:00.000Z')
  const staleLastSeenAt = new Date(now.getTime() - SESSION_LAST_SEEN_REFRESH_INTERVAL_MS)
  const { db } = createLastSeenDb({
    error: new Error('unexpected private database failure')
  })

  await assert.rejects(
    refreshSessionLastSeenIfStale({
      db: db as never,
      sessionId: 'session-1',
      lastSeenAt: staleLastSeenAt,
      now
    }),
    /unexpected private database failure/
  )
})
