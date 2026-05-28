import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TRANSIENT_STATE_RETENTION_MS,
  pruneTransientState,
  runTransientStateRetentionOnce
} from './transient-state-retention-service'

type DeleteManyCall = {
  where: unknown
}

const createRetentionDb = (options: { errorTable?: string } = {}) => {
  const calls: Record<string, DeleteManyCall[]> = {
    session: [],
    chatPendingTurn: [],
    unityLaunchContext: [],
    failedLoginAttempt: []
  }

  const createDelegate = (tableName: keyof typeof calls, count: number) => ({
    deleteMany: async (input: DeleteManyCall) => {
      calls[tableName].push(input)
      if (options.errorTable === tableName) {
        throw new Error(`delete failed for ${tableName} with token secret`)
      }

      return { count }
    }
  })

  return {
    calls,
    db: {
      session: createDelegate('session', 2),
      chatPendingTurn: createDelegate('chatPendingTurn', 3),
      unityLaunchContext: createDelegate('unityLaunchContext', 4),
      failedLoginAttempt: createDelegate('failedLoginAttempt', 5)
    }
  }
}

test('pruneTransientState deletes only rows older than the retention cutoff', async () => {
  const now = new Date('2026-05-20T12:00:00.000Z')
  const cutoff = new Date(now.getTime() - TRANSIENT_STATE_RETENTION_MS)
  const { db, calls } = createRetentionDb()

  const result = await pruneTransientState({
    db: db as never,
    now
  })

  assert.deepEqual(result, {
    sessionsDeleted: 2,
    pendingTurnsDeleted: 3,
    unityLaunchContextsDeleted: 4,
    failedLoginAttemptsDeleted: 5
  })
  assert.deepEqual(calls.session[0], {
    where: {
      OR: [
        {
          expiresAt: {
            lt: cutoff
          }
        },
        {
          revokedAt: {
            lt: cutoff
          }
        }
      ]
    }
  })
  assert.deepEqual(calls.chatPendingTurn[0], {
    where: {
      OR: [
        {
          status: 'COMMITTED',
          OR: [{ committedAt: { lt: cutoff } }, { committedAt: null, updatedAt: { lt: cutoff } }]
        },
        {
          status: 'ABORTED',
          OR: [{ abortedAt: { lt: cutoff } }, { abortedAt: null, updatedAt: { lt: cutoff } }]
        },
        {
          status: 'EXPIRED',
          OR: [{ expiredAt: { lt: cutoff } }, { expiredAt: null, updatedAt: { lt: cutoff } }]
        }
      ]
    }
  })
  assert.deepEqual(calls.unityLaunchContext[0], {
    where: {
      OR: [
        {
          expiresAt: {
            lt: cutoff
          }
        },
        {
          consumedAt: {
            lt: cutoff
          }
        }
      ]
    }
  })
  assert.deepEqual(calls.failedLoginAttempt[0], {
    where: {
      OR: [
        {
          lockUntil: {
            lt: cutoff
          }
        },
        {
          lockUntil: null,
          windowStartAt: {
            lt: cutoff
          }
        }
      ]
    }
  })
})

test('runTransientStateRetentionOnce logs counts without row payloads', async () => {
  const logs: unknown[] = []
  const { db } = createRetentionDb()

  await runTransientStateRetentionOnce({
    db: db as never,
    now: () => new Date('2026-05-20T12:00:00.000Z'),
    logger: {
      info: (...args: unknown[]) => logs.push(args),
      error: (...args: unknown[]) => logs.push(args)
    }
  })

  assert.equal(logs.length, 1)
  const serializedLog = JSON.stringify(logs[0])
  assert.match(serializedLog, /sessionsDeleted/)
  assert.equal(serializedLog.includes('secret'), false)
  assert.equal(serializedLog.includes('token'), false)
})

test('runTransientStateRetentionOnce logs cleanup failures without throwing', async () => {
  const errors: unknown[] = []
  const { db } = createRetentionDb({
    errorTable: 'session'
  })

  await runTransientStateRetentionOnce({
    db: db as never,
    now: () => new Date('2026-05-20T12:00:00.000Z'),
    logger: {
      info: () => undefined,
      error: (...args: unknown[]) => errors.push(args)
    }
  })

  assert.equal(errors.length, 1)
  const serializedError = JSON.stringify(errors[0])
  assert.match(serializedError, /transient state retention failed/)
  assert.equal(serializedError.includes('secret'), false)
  assert.equal(serializedError.includes('token'), false)
})
